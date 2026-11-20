import { BOUNTY, COLD_WAR_MAX, TWO_THIRDS_MAX } from './catalogue';
import { MECHANICS } from './engine';
import { reader } from './index';
import type { Engine } from './engine';
import type { Play, Roster, State } from './types';

/**
 * What each screen is allowed to know. The host sees everything; a
 * team sees its own secrets and nobody else's; the TV sees only what
 * the whole room may. Secrets are left out here, on the server, so a
 * phone can't find them by reading the page's data.
 *
 * Views carry ids, not names: the screen joins names from the roster.
 */
type Viewer = { role: 'host' } | { role: 'display' } | { role: 'team'; teamId: string };

function playView(pl: Play, host: boolean, mine: string | null) {
  const base = { kind: pl.kind, deadline: pl.deadline, done: !!pl.done };
  const veil = <T>(box: Record<string, T>, open: boolean) => (open || host ? box : Object.fromEntries(Object.entries(box).map(([id, v]) => [id, id === mine ? v : { locked: true }])));
  const own = <T>(box: Record<string, T>, open: boolean) => (open || host ? box : mine && box[mine] ? { [mine]: box[mine] } : {});
  if (pl.kind === 'twothirds') {
    const r = pl.revealed;
    return { ...base, revealed: r, picks: veil(pl.picks, r), max: TWO_THIRDS_MAX, average: r ? pl.average : null, target: r ? pl.target : null, order: r ? pl.order : null, missed: r ? pl.missed : null, drinks: r ? pl.drinks : null };
  }
  if (pl.kind === 'coldwar') {
    const r = pl.revealed;
    return { ...base, revealed: r, bids: veil(pl.bids, r), drinks: r ? pl.drinks : null, order: r ? pl.order : null, max: COLD_WAR_MAX };
  }
  if (pl.kind === 'dilemma') {
    const box = pl.choices[pl.n] || {};
    const pair = pl.pairs.find((x) => mine && x.includes(mine));
    return {
      ...base, state: pl.state, n: pl.n, total: pl.total, pairs: pl.pairs, scores: pl.scores, shots: pl.shots,
      partner: pair ? pair.find((id) => id !== mine) : null,
      picked: Object.keys(box),
      mine: mine && box[mine] ? box[mine].choice : null,
      live: host ? box : null,
      results: pl.results.map((x, i) => (i === pl.n && pl.state === 'open' ? null : x)),
    };
  }
  if (pl.kind === 'trivia') {
    const q = pl.questions[pl.qi];
    const shown = pl.state === 'revealed' || !!pl.done;
    const box = pl.answers[pl.qi] || {};
    return {
      ...base, state: pl.state, qi: pl.qi, count: pl.questions.length, scores: pl.scores,
      question: q ? { q: q.q, options: q.options, answer: shown || host ? q.answer : null } : null,
      answered: Object.keys(box),
      answers: own(box, shown),
    };
  }
  if (pl.kind === 'anime') {
    const it = pl.items[pl.i];
    const shown = pl.state === 'won' || pl.state === 'missed' || !!pl.done;
    return {
      ...base, state: pl.state, i: pl.i, count: pl.items.length, scores: pl.scores, winner: pl.winners[pl.i] || null,
      label: it?.label || null, answer: it && (shown || host) ? it.answers[0] : null, accepted: host && it ? it.answers : null,
      myTries: mine ? pl.guesses[pl.i]?.[mine] || 0 : 0, tries: host ? pl.guesses[pl.i] || {} : null,
    };
  }
  const shown = pl.state === 'revealed' || !!pl.done;
  const box = pl.votes[pl.n] || {};
  return { ...base, state: pl.state, n: pl.n, total: pl.total, scores: pl.scores, truth: shown ? pl.truth[pl.n] : null, voted: Object.keys(box), votes: own(box, shown) };
}

function roundView(e: Engine, viewer: Viewer) {
  const r = e.round;
  if (!r) return null;
  const host = viewer.role === 'host';
  const mine = viewer.role === 'team' ? viewer.teamId : null;
  const slot = e.slotOf(r.number);
  return {
    id: r.id, number: r.number, act: r.act, inAct: r.inAct, final: r.final, actName: slot.actName,
    actMechanics: (e.s.night.acts[r.act - 1]?.mechanics || []).map((k) => MECHANICS[k]?.name).filter(Boolean),
    gameId: r.gameId, gameName: r.gameName, isGroup: r.isGroup, playersNeeded: r.playersNeeded, phase: r.phase,
    startedAt: r.startedAt, pickDeadline: r.pickDeadline, shopDeadline: r.shopDeadline, revealedAt: r.revealedAt,
    // Picks stay secret until they're all revealed at once.
    picks: r.revealedAt || host ? r.picks : mine && r.picks[mine] ? { [mine]: r.picks[mine] } : {},
    picked: Object.keys(r.picks),
    pickedBy: host || r.revealedAt ? r.pickedBy : {},
    placings: r.placings, proposed: host ? r.proposed : null, prizes: r.prizes, winnerTeamId: r.winnerTeamId,
    drinksStartedAt: r.drinksStartedAt, completedAt: r.completedAt,
    // Nobody learns who has Reflect until the queue is built.
    reflectTeamId: host || r.drinksStartedAt ? r.reflectTeamId : null,
    play: r.play ? playView(r.play, host, mine) : null,
    cooldown: r.isGroup ? [] : [...e.cooldownIds(r)],
    eligible: mine && r.phase === 'game' ? e.eligibleFor(r, mine) : [],
    serves: r.serves.map((s) => {
      const orders = s.orderIds.map((id) => e.order(id)).filter((o) => !!o);
      return {
        teamId: s.teamId, drinks: s.drinks, servedAt: s.servedAt, timerEndsAt: s.timerEndsAt, finishedAt: s.finishedAt, missed: s.missed,
        failed: s.failed, reward: s.reward, streamLost: s.streamLost,
        // A tenth of a team's points would give away its hidden score.
        pointsLost: host || mine === s.teamId ? s.pointsLost : null,
        neat: orders.filter((o) => o.noChaser).reduce((n, o) => n + o.qty, 0),
        // Only the bar sees what to pour and who sent it.
        ...(host
          ? { awards: s.awards, breakdown: orders.map((o) => ({ itemId: o.itemId, name: o.name, emoji: o.emoji, qty: o.qty, noChaser: !!o.noChaser, origin: o.origin, fromTeamId: o.fromTeamId, hidden: !!o.hidden, reflected: !!o.reflected, note: o.note })) }
          : {}),
      };
    }),
  };
}

function base(e: Engine, viewer: Viewer) {
  const s = e.s;
  const host = viewer.role === 'host';
  const mine = viewer.role === 'team' ? viewer.teamId : null;
  return {
    settings: s.settings,
    shopOpen: s.shopOpen,
    teams: e.inPlay().map((id) => {
      const own = host || id === mine;
      const t = s.teams[id];
      return {
        id,
        money: e.money(id),
        earned: e.earned(id),
        // Other teams' points are the last published snapshot; your own are live.
        points: own ? e.points(id) : s.shown.points[id] ?? 0,
        pointsLive: own,
        drinkStream: t.drinkStream,
        ledger: own ? s.ledger.filter((x) => x.teamId === id).slice(-20).reverse() : null,
        reflectUsed: own ? t.reflectUsed : null,
        pickpockets: own ? t.pickpockets : null,
      };
    }),
    items: host ? s.items : s.items.filter((i) => e.itemLive(i)),
    // The library holds the answers. Only the host gets them; everyone else gets how many there are.
    games: host ? s.games : s.games.map(({ questions, questionsText, openings, openingsText, ...g }) => ({ ...g, questionCount: questions.length, openingCount: openings.length })),
    rounds: s.rounds.map((r) => ({ number: r.number, act: r.act, inAct: r.inAct, final: r.final, actName: e.slotOf(r.number).actName, gameName: r.gameName, phase: r.phase, winnerTeamId: r.winnerTeamId, placings: r.placings, prizes: r.prizes })),
    plan: { acts: s.settings.actsCount, perAct: s.settings.roundsPerAct, total: e.totalRounds() },
    night: s.night,
    mechanics: Object.fromEntries(Object.entries(MECHANICS).map(([k, m]) => [k, { name: m.name, desc: m.desc }])),
    winner: s.winner,
    pointsAsOf: s.shown.at,
    flash: s.flash && e.now - s.flash.ts < 120000 ? s.flash : null,
    bountyRules: { target: BOUNTY.target, rounds: BOUNTY.rounds, missQty: BOUNTY.missQty },
    nextDeadline: e.nextDeadline(),
    penaltiesOwed: s.penalties.filter((x) => !x.appliedRound).map(({ teamId, qty, itemId, reason }) => ({ teamId, qty, itemId, reason })),
    feed: s.feed.slice(0, 80),
    round: roundView(e, viewer),
  };
}

export function hostView(state: State, roster: Roster, now: number) {
  const e = reader(state, roster, now);
  return {
    ...base(e, { role: 'host' }),
    standards: { sent: e.standardsSent(), target: state.settings.targetStandards, rounds: e.totalRounds(), played: state.rounds.filter((r) => r.phase === 'done').length },
    orders: e.s.orders.slice(0, 200),
    bounties: e.s.bounties,
    reflects: e.s.reflects,
    played: Object.fromEntries(roster.members.map((m) => [m.id, e.gamesPlayed(m.id)])),
  };
}

export function displayView(state: State, roster: Roster, now: number) {
  return base(reader(state, roster, now), { role: 'display' });
}

export function teamView(state: State, roster: Roster, now: number, teamId: string) {
  const e = reader(state, roster, now);
  const s = e.s;
  const current = e.round && e.round.phase !== 'done' ? e.round.number : s.rounds.length;
  const bounties = s.bounties.filter((b) => b.teamId === teamId);
  const t = s.teams[teamId];
  return {
    ...base(e, { role: 'team', teamId }),
    teamId,
    orders: s.orders
      .filter((o) => o.fromTeamId === teamId || o.targetTeamId === teamId || o.originalTargetTeamId === teamId)
      .slice(0, 60)
      // A Burner Phone hides the sender from the team it hits.
      .map((o) => (o.hidden && o.fromTeamId !== teamId ? { ...o, fromTeamId: null } : o)),
    eyeSpy: e.eyeSpyTable(teamId),
    bounties,
    // Power-ups bought that haven't started yet.
    pending: [
      ...s.reflects.filter((x) => x.teamId === teamId && x.round > current).map((x) => ({ kind: 'reflect', round: x.round })),
      ...(t?.eyeSpyFrom && t.eyeSpyFrom > current ? [{ kind: 'eyespy', round: t.eyeSpyFrom }] : []),
      ...bounties.filter((b) => b.status === 'active' && b.startRound > current).map((b) => ({ kind: 'bounty', round: b.startRound })),
    ],
    activeReflect: s.reflects.some((x) => x.teamId === teamId && x.round === current && e.round?.phase !== 'done'),
    played: Object.fromEntries(e.members(teamId).map((id) => [id, e.gamesPlayed(id)])),
  };
}
