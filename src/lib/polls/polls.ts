import { db } from '@/lib/supabase';
import { loadRoster } from '@/lib/sessions/roster';
import { sessions } from '@/lib/sessions/server';
import { moduleFor } from '@/modules';
import { checkBallot, tally, type Ballot, type Candidate, type PollResults } from './tally';

export type Poll = {
  id: string;
  eventId: string;
  status: 'open' | 'closed' | 'hidden';
  picks: number;
  results: (PollResults & { awards?: string[] }) | null;
};

type Row = { id: string; event_id: string; status: Poll['status']; picks: number; results: Poll['results'] };
const COLS = 'id, event_id, status, picks, results';
const poll = (r: Row): Poll => ({ id: r.id, eventId: r.event_id, status: r.status, picks: r.picks, results: r.results });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everyone who can be voted for: checked in and still here. */
export async function candidates(eventId: string): Promise<Candidate[]> {
  const roster = await loadRoster(eventId);
  return roster.members.filter((m) => !m.away).map((m) => ({ id: m.id, name: m.name, groupId: m.groupId }));
}

/** The poll on this party's TV right now (open, or closed with its results showing), if any. */
export async function showingPoll(eventId: string): Promise<Poll | null> {
  const { data } = await db().from('polls').select(COLS).eq('event_id', eventId).in('status', ['open', 'closed']).maybeSingle();
  return data ? poll(data as Row) : null;
}

export async function getPoll(pollId: string): Promise<Poll | null> {
  if (!UUID.test(pollId)) return null;
  const { data } = await db().from('polls').select(COLS).eq('id', pollId).maybeSingle();
  return data ? poll(data as Row) : null;
}

/** Open the costume vote. If one is already showing, that one is returned. */
export async function openPoll(eventId: string): Promise<Poll | null> {
  const existing = await showingPoll(eventId);
  if (existing) return existing;
  const { data } = await db().from('polls').insert({ event_id: eventId, kind: 'costume' }).select(COLS).maybeSingle();
  // Two hosts at once: the database allows one showing poll, so the loser reads the winner's.
  return data ? poll(data as Row) : showingPoll(eventId);
}

async function ballots(pollId: string): Promise<Ballot[]> {
  const { data } = await db().from('poll_votes').select('best, worst').eq('poll_id', pollId);
  return ((data ?? []) as { best: string[]; worst: string[] }[]).map((v) => ({ best: v.best ?? [], worst: v.worst ?? [] }));
}

/** The count so far, for the host to watch while voting is open. */
export async function liveTally(p: Poll): Promise<PollResults> {
  return tally(await ballots(p.id), await candidates(p.eventId));
}

/**
 * Close the vote and fix its result. If a game is running, it is told
 * who won and lost, through the same actions a host would send. Each
 * carries an id built from the poll's, so closing twice awards once.
 */
export async function closePoll(pollId: string): Promise<void> {
  const p = await getPoll(pollId);
  if (!p || p.status !== 'open') return;
  const results: NonNullable<Poll['results']> = await liveTally(p);

  const { data: closed } = await db()
    .from('polls')
    .update({ status: 'closed', closed_at: new Date().toISOString(), results })
    .eq('id', pollId)
    .eq('status', 'open')
    .select('id');
  if (!closed?.length) return; // someone else closed it first

  const game = await sessions.store.activeForEvent(p.eventId);
  const awards = game ? moduleFor(game.moduleKey)?.costumeAwards?.({ bestTeamId: results.best[0]?.groupId ?? null, worstTeamId: results.worst[0]?.groupId ?? null }) : null;
  if (!game || !awards?.length) return;
  const applied: string[] = [];
  for (const [i, action] of awards.entries()) {
    const out = await sessions.dispatch(game.id, { role: 'host' }, { ...action, id: `poll-${pollId}-${i}` });
    applied.push(out.ok ? action.type : `${action.type}:${out.code}`);
  }
  await db().from('polls').update({ results: { ...results, awards: applied } }).eq('id', pollId);
}

/** Take the results off the TV. A new vote can then be opened. */
export async function hidePoll(pollId: string): Promise<void> {
  if (!UUID.test(pollId)) return;
  await db().from('polls').update({ status: 'hidden' }).eq('id', pollId).in('status', ['open', 'closed']);
}

export async function myBallot(pollId: string, voterId: string | null): Promise<Ballot | null> {
  if (!voterId) return null;
  const { data } = await db().from('poll_votes').select('best, worst').eq('poll_id', pollId).eq('voter_id', voterId).maybeSingle();
  return data ? { best: (data.best as string[]) ?? [], worst: (data.worst as string[]) ?? [] } : null;
}

/** Record one phone's ballot. Voting again replaces it, until the vote closes. */
export async function castBallot(pollId: string, voterId: string, input: { best?: unknown; worst?: unknown }): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await getPoll(pollId);
  if (!p || p.status !== 'open') return { ok: false, error: 'Voting has closed.' };
  const checked = checkBallot(input, (await candidates(p.eventId)).map((c) => c.id), p.picks);
  if (!checked.ok) return checked;
  const { error } = await db()
    .from('poll_votes')
    .upsert({ poll_id: pollId, voter_id: voterId, best: checked.ballot.best, worst: checked.ballot.worst, updated_at: new Date().toISOString() }, { onConflict: 'poll_id,voter_id' });
  return error ? { ok: false, error: 'Couldn’t save your vote. Try again.' } : { ok: true };
}
