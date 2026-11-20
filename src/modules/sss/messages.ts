/**
 * The words for everything the engine says. The engine emits a code
 * and parameters; these turn them into a sentence for one party, using
 * that party's theme for what a team, the host and the shop are called.
 *
 * Nothing here may name a theme. "Team" comes from `v.group`, never
 * from a literal.
 */

/** What a sentence needs from the party it's said at. */
export type Voice = {
  /** A team's name, from its id. */
  team: (id: unknown) => string;
  /** A person's name, from their participant id. */
  person: (id: unknown) => string;
  money: (n: unknown) => string;
  /** The theme's word for a team: "block". Lower case. */
  group: string;
  groups: string;
  /** "the Warden", "the hosts". */
  host: string;
  /** "the commissary", "the shop". */
  shop: string;
};

type P = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Say = (p: P, v: Voice) => string;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const drinks = (p: P) => `${p.qty > 1 ? `${p.qty}× ` : ''}${p.emoji ? `${p.emoji} ` : ''}${p.name}`;
const why = (p: P) => (p.note ? ` for ${p.note}` : '');

/** "Act 2 · Final round", with the host's own act name if they gave one. */
export function roundLabel(p: P): string {
  return `${p.actName || `Act ${p.act}`} · ${p.final ? 'Final round' : `Round ${p.inAct}`}`;
}

/** Fills {group} and {groups} in host-written text (item descriptions, game rules). */
export function fill(text: string, v: Pick<Voice, 'group' | 'groups'>): string {
  return text.replace(/\{group\}/g, v.group).replace(/\{groups\}/g, v.groups);
}

export const FEED = {
  'shop.opened': (_p, v) => `${cap(v.shop)} is open.`,
  'shop.closed': (_p, v) => `${cap(v.shop)} is closed. No more orders until it reopens.`,
  'shop.timeUp': (_p, v) => `Time’s up. ${cap(v.shop)} is closed. To the bar.`,
  'shop.secret': (p, v) => `${v.team(p.teamId)} made a suspicious purchase.`,
  'money.paid': (p, v) => `${cap(v.host)} paid ${v.team(p.teamId)} ${v.money(p.amount)}${why(p)}.`,
  'money.docked': (p, v) => `${cap(v.host)} docked ${v.team(p.teamId)} ${v.money(p.amount)}${why(p)}.`,
  'points.given': (p, v) => `${cap(v.host)} gave ${v.team(p.teamId)} some points${why(p)}. The standings update at the end of the act.`,
  'points.taken': (p, v) => `${cap(v.host)} took some points from ${v.team(p.teamId)}${why(p)}. The standings update at the end of the act.`,
  'points.published': (p) => `End of ${/^\d+$/.test(p.act) ? `Act ${p.act}` : p.act}: the standings are updated.`,
  'game.rulesUpdated': (p) => `Rules updated for ${p.game}. Check the briefing on your phone.`,
  'drink.sent': (p, v) => `${p.fromTeamId ? v.team(p.fromTeamId) : 'Anonymous'} sent ${drinks(p)} to ${v.team(p.toTeamId)}.`,
  'drink.assigned': (p, v) => `${cap(v.host)} sent ${v.team(p.toTeamId)} ${drinks(p)}${why(p)}.`,
  'order.cancelled': (p, v) => `${cap(v.host)} cancelled ${drinks(p)}.${p.teamId ? ` ${v.team(p.teamId)} was refunded.` : ''}`,
  'nochaser.bought': (p, v) => `${p.teamId ? v.team(p.teamId) : 'Someone'} bought No Chasers: every drink they send this round is taken neat.`,
  'ghost.bought': () => 'Someone bought a Burner Phone. Their drinks this round are anonymous.',
  'bounty.placed': (p, v) => `${v.team(p.teamId)} put out ${p.bounty === 'winner' ? 'a Winner’s' : 'an Open'} Bounty: ${p.target} drinks in ${plural(p.rounds, 'round')}, starting round ${p.startRound}. How much they staked is secret.`,
  'bounty.hit': (p, v) => `${v.team(p.teamId)} hit their ${p.bounty === 'winner' ? 'Winner’s' : 'Open'} Bounty. The payout shows at the end of the act.`,
  'bounty.missed': (p, v) => `${v.team(p.teamId)} missed their bounty, lost their stake and the same again. ${plural(p.qty, 'shot')} next round.`,
  'mystery.arrived': (p, v) => `New in ${v.shop}: the Mystery Box (${v.money(p.price)}). A Reflect, free drinks for someone, a ${v.money(p.jackpot)} jackpot or a Pickpocket.`,
  'mystery.jackpot': (p, v) => `${v.team(p.teamId)} opened a Mystery Box and hit the jackpot: +${v.money(p.amount)}.`,
  'mystery.pickpocket': (p, v) => `${v.team(p.teamId)} opened a Mystery Box and got a Pickpocket. Somebody is about to lose half their cash.`,
  'mystery.secret': (p, v) => `${v.team(p.teamId)} opened a Mystery Box. What’s inside is a secret.`,
  'mystery.self': (p, v) => `${v.team(p.teamId)} opened a Mystery Box and it’s ${drinks(p)} for themselves.`,
  'mystery.other': (p, v) => `${v.team(p.teamId)} opened a Mystery Box and ${drinks(p)} lands on ${v.team(p.toTeamId)}.`,
  'pickpocket.done': (p, v) => `${v.team(p.teamId)} pickpocketed ${v.team(p.toTeamId)}: ${v.money(p.amount)}, half their cash.`,
  'night.confirmed': (p) => `The night is set: ${plural(p.acts, 'act')}, ${plural(p.rounds, 'round')} to play.`,
  'night.restarted': (_p, v) => `The night restarts from round 1. Every ${v.group} is back to the start.`,
  'act.started': (p) => `${p.name || `Act ${p.act}`} begins: ${plural(p.rounds, 'round')}, the last one is the act’s final round.${p.mechanics?.length ? ` This act: ${p.mechanics.join(', ')}.` : ''}`,
  'round.started': (p, v) => {
    const head = `${roundLabel(p)}: ${p.game}.`;
    if (p.app === 'coldwar') return `${head} Every ${v.group} picks its shots on its phone, in secret. ${p.seconds} seconds.`;
    if (p.app === 'twothirds') return `${head} Every ${v.group} picks a number on its phone, in secret. ${p.seconds} seconds.`;
    if (p.app) return `${head} Play it on your ${v.group}’s phone.`;
    if (!p.playersNeeded) return `${head} Everyone plays.`;
    return `${head} Each ${v.group} picks ${plural(p.playersNeeded, 'player')} on its phone. ${p.seconds} seconds.`;
  },
  'round.done': (p) => `${roundLabel(p)} is done.${p.last ? ' That’s the night.' : p.final ? ' That’s the end of the act.' : ''}`,
  'picks.revealed': (p, v) =>
    `Picks are in for ${p.game}. ${Object.entries(p.picks as Record<string, string[]>)
      .map(([t, ids]) => `${v.team(t)}: ${ids.map((id) => v.person(id)).join(', ') || 'nobody'}`)
      .join(' · ')}`,
  'results.entered': (p, v) =>
    `${p.game} results: ${Object.entries(p.placings as Record<string, number>)
      .sort((a, b) => a[1] - b[1])
      .map(([t, place]) => `${ordinal(place)} ${v.team(t)} +${v.money(p.prizes[t])}`)
      .join(', ')}. ${cap(v.shop)} is open.`,
  'reflect.played': (p, v) => `${v.team(p.teamId)} played Reflect. Every drink aimed at them goes back to whoever sent it.`,
  'drinks.started': (p, v) => (p.order.length ? `Drinks time. Order at the bar: ${p.order.map((t: string) => v.team(t)).join(' → ')}.` : 'Nobody sent any drinks this round.'),
  'bar.called': (p, v) => `${v.team(p.teamId)} is up at the bar: ${plural(p.drinks, 'drink')}. Pouring now.`,
  'bar.clock': (p, v) => `${v.team(p.teamId)}: ${p.seconds} seconds on the clock.`,
  'bar.done': (p, v) => `${v.team(p.teamId)} finished in time: +${v.money(p.reward)}. Next time: ${v.money(p.next)}.`,
  'bar.failed': (p, v) => `${v.team(p.teamId)} couldn’t finish their drinks: they lose ${p.pct}% of their points${p.streamLost ? `, and their drink income is back to ${v.money(0)}` : ''}.`,
  'bar.timeUp': (p, v) => `${v.team(p.teamId)} ran out of time. That’s an extra shot next round${p.streamLost ? `, and their drink income is back to ${v.money(0)}` : ''}.`,
  'winner.crowned': (p, v) => `${v.team(p.teamId)} wins the night with ${plural(p.points, 'point')}.`,
  'play.finished': (p, v) => `${p.game} is over. ${cap(v.host)} is confirming the results.`,
  'anime.timeUp': (p) => `Time’s up on opening ${p.n}: it was ${p.answer}.`,
  'anime.nobody': (p) => `Nobody got opening ${p.n}: it was ${p.answer}.`,
  'anime.named': (p, v) => `${v.team(p.teamId)} named opening ${p.n} first: ${p.answer}.`,
  'lying.revealed': (p, v) => `Story ${p.n}: it was ${p.truth === 'truth' ? 'the truth' : 'a lie'}. ${plural(p.right, v.group)} called it.`,
  'twothirds.revealed': (p, v) =>
    `Two-thirds of the average (${p.average}) is ${p.target}. ${p.closest ? `${v.team(p.closest)} was closest with ${p.closestPick}.` : 'Nobody picked.'}${p.furthest ? ` ${v.team(p.furthest)} was furthest off and drinks ${p.furthestDrinks}.` : ''}`,
  'dilemma.turn': (p, v) => {
    const word = (c: string) => (c === 'snitch' ? 'snitched' : 'stayed silent');
    const name = (id: string) => (id === 'house' ? 'the House' : v.team(id));
    return `Turn ${p.n}: ${(p.pairs as P[]).map((x) => `${name(x.a)} ${word(x.ca)}, ${name(x.b)} ${word(x.cb)}`).join(' · ')}.`;
  },
  'coldwar.revealed': (p, v) =>
    `Cold War: ${(p.bids as P[]).map((b) => `${v.team(b.teamId)} ${b.n}`).join(' · ')}. ${(p.drinkers as P[]).map((d) => `${v.team(d.teamId)} drinks ${d.drinks}`).join(', ')}.`,
} satisfies Record<string, Say>;

export type FeedKind = keyof typeof FEED;

export const ERRORS = {
  'action.unknown': () => 'Unknown action.',
  'action.forbidden': () => 'That isn’t yours to do.',
  'team.unknown': (_p, v) => `That ${v.group} isn’t playing.`,
  'team.only': (_p, v) => `Only a ${v.group}’s phone can do that.`,
  'amount.zero': () => 'Amount must be a non-zero number.',
  'game.name': () => 'Game needs a name.',
  'game.unknown': () => 'Game not found.',
  'game.kind': () => 'Unknown kind of game.',
  'game.triviaLine': (p) => `Trivia line ${p.line}: write "Question | answer | answer | … | right answer"${p.letters ? ` (the last part says which is right, ${p.letters})` : ''}.`,
  'game.openingLine': (p) => `Opening line ${p.line}: write "Label | anime | other spellings…".`,
  'game.noQuestions': (p) => `${p.game} has no trivia questions yet. Add them in setup.`,
  'game.noOpenings': (p) => `${p.game} has no openings yet. Add them in setup.`,
  'item.type': () => 'Unknown item type.',
  'item.name': () => 'Item needs a name.',
  'item.unknown': () => 'Item not found.',
  'item.offShelf': () => 'That item is off the shelf.',
  'item.soldOut': () => 'Sold out.',
  'shop.closed': (_p, v) => `${cap(v.shop)} is closed.`,
  'drink.qty': (p) => `Send between 1 and ${p.max} drinks at a time.`,
  'money.short': (p, v) => `Not enough cash. ${v.team(p.teamId)} has ${v.money(p.has)}, this costs ${v.money(p.price)}.`,
  'reflect.used': (_p, v) => `Your ${v.group} has already used its Reflect tonight.`,
  'reflect.taken': (_p, v) => `Another ${v.group} already has Reflect for next round.`,
  'eyespy.one': () => 'One Eye Spy per round.',
  'nochaser.noRound': () => 'No Chasers only works while a round is on.',
  'nochaser.has': (_p, v) => `Your ${v.group} already has No Chasers this round.`,
  'ghost.noRound': () => 'A Burner Phone only works while a round is on.',
  'ghost.has': (_p, v) => `Your ${v.group} is already anonymous this round.`,
  'bounty.running': (_p, v) => `Your ${v.group} already has a bounty running.`,
  'bounty.winnerOnly': (_p, v) => `Only the ${v.group} that just won this round’s game can buy the Winner’s Bounty.`,
  'bounty.stake': (p) => `Stake between ${p.min} and ${p.max} points.`,
  'bounty.short': (p, v) => `Your ${v.group} only has ${plural(p.points, 'point')} to stake.`,
  'target.self': (_p, v) => `Pick a different ${v.group}.`,
  'pickpocket.none': (_p, v) => `Your ${v.group} has no Pickpocket to use.`,
  'pickpocket.broke': (p, v) => `${v.team(p.teamId)} is broke. Pick another ${v.group}.`,
  'order.unknown': () => 'Order not found.',
  'order.closed': () => 'Order already closed.',
  'assign.queueBuilt': () => 'This round’s queue is already built. Assign it after the round.',
  'assign.drink': () => 'Pick a drink.',
  'act.unknown': () => 'No such act.',
  'mechanic.unknown': (p) => `Unknown mechanic: ${p.key}`,
  'slot.unknown': () => 'No such round.',
  'slot.played': () => 'That round has already been played.',
  'night.emptyRounds': (p) => `Choose a game for every round first (${plural(p.count, 'round')} still empty).`,
  'round.none': () => 'No round is running. Start one first.',
  'round.phase': (p) => `That only works in the ${p.phase} phase.`,
  'round.running': () => 'A round is still running.',
  'round.last': () => 'That was the final round. Crown the winner.',
  'round.noGame': () => 'Pick a game for this round.',
  'round.noTeams': (_p, v) => `Nobody is on a ${v.group} yet. Run the draw first.`,
  'picks.in': () => 'Picks are already in.',
  'picks.late': () => 'Time’s up. Your players are being picked for you.',
  'picks.ineligible': (p, v) => `${v.person(p.playerId)} can’t play this round.`,
  'picks.count': (p) => `Pick exactly ${plural(p.count, 'player')}.`,
  'results.empty': () => 'Enter at least one placing.',
  'bar.noServe': (_p, v) => `That ${v.group} has nothing to drink this round.`,
  'bar.notNext': (_p, v) => `Another ${v.group} is ahead of them in line.`,
  'bar.notCalled': (_p, v) => `Call the ${v.group} up first.`,
  'bar.finished': (_p, v) => `That ${v.group} is already done.`,
  'bar.notLast': (_p, v) => `Only the last ${v.group} called up can be sent back.`,
  'play.none': () => 'There’s no app-run game in progress.',
  'play.revealed': () => 'It’s already revealed.',
  'play.late': () => 'Time’s up.',
  'play.closed': () => 'Nothing is open to answer right now.',
  'play.answered': (_p, v) => `Your ${v.group} already answered.`,
  'play.revealFirst': () => 'Reveal this one first.',
  'play.wasLast': (_p, v) => `That was the last one. Finish to place the ${v.groups}.`,
  'play.noNext': () => 'This game has no next step: reveal, then finish.',
  'coldwar.range': (p) => `Pick between 1 and ${p.max} shots.`,
  'twothirds.range': (p) => `Pick a whole number from 0 to ${p.max}.`,
  'dilemma.choice': () => 'Pick Stay Silent or Snitch.',
  'trivia.choice': () => 'Pick one of the answers.',
  'anime.blank': () => 'Type the anime’s name.',
  'lying.choice': () => 'Vote Truth or Lie.',
  'lying.truth': () => 'Was it the truth or a lie?',
} satisfies Record<string, Say>;

export type ErrorCode = keyof typeof ERRORS;

/** A feed line in words. An unknown kind (from a newer engine) renders as nothing, not a crash. */
export function sayFeed(kind: string, params: P, v: Voice): string {
  return (FEED as Record<string, Say>)[kind]?.(params, v) ?? '';
}

export function sayError(code: string, params: P, v: Voice): string {
  return (ERRORS as Record<string, Say>)[code]?.(params, v) ?? 'Something went wrong.';
}

/** The game's own words when the theme has nothing to say about them. */
export const DEFAULT_WORDS = { host: 'the hosts', shop: 'the shop' };
