import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import { candidates, getPoll, myBallot } from '@/lib/polls/polls';
import { readDeviceId } from '@/lib/teamDevice';
import { themePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';
import VoteForm from './VoteForm';

export const dynamic = 'force-dynamic';

/**
 * The costume vote, on a guest's own phone. Anyone who scans the TV's
 * code can vote, with no sign-in: one vote per phone.
 */
export default async function VotePage({ params }: { params: { pollId: string } }) {
  const poll = await getPoll(params.pollId);
  if (!poll) notFound();

  const supabase = db();
  const [{ data: ev }, { data: blocks }, people, mine] = await Promise.all([
    supabase.from('events').select('name, theme_key, theme_title').eq('id', poll.eventId).maybeSingle(),
    supabase.from('blocks').select('id, name, colour').eq('event_id', poll.eventId).order('name', { ascending: true }),
    candidates(poll.eventId),
    myBallot(poll.id, readDeviceId()),
  ]);
  const pack = themePack(ev?.theme_key);

  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  const groups = [
    ...((blocks ?? []) as { id: string; name: string; colour: string }[]).map((b) => ({ ...b, people: sorted.filter((p) => p.groupId === b.id) })),
    { id: 'none', name: `No ${pack.copy.groupNoun.toLowerCase()} yet`, colour: 'var(--line)', people: sorted.filter((p) => !p.groupId) },
  ].filter((g) => g.people.length);

  return (
    <>
      <ThemeStyle pack={pack} />
      <div className="shell">
        <div className="topbar">
          <span>{(ev?.theme_title || ev?.name || 'LeParty').toUpperCase()}</span>
          <span>COSTUME VOTE</span>
        </div>
        <div className="body">
          {poll.status === 'open' ? (
            <>
              <h1>Best and worst costume</h1>
              <p className="lede">
                Pick up to {poll.picks} of each. Tap a name once for best, again for worst, and once more to clear it.
              </p>
              <VoteForm pollId={poll.id} groups={groups} picks={poll.picks} initial={mine} />
            </>
          ) : (
            <>
              <h1>Voting has closed</h1>
              <p className="lede">The results are on the big screen.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
