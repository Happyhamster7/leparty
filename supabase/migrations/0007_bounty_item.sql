-- LeParty — Bounty item
-- Adds a third items.buyer_rule value: 'game_winner', restricted to
-- whoever won that round's just-played game (not the overall
-- leaderboard leader — a different team each round, potentially).
-- See docs/halloween-game-design.md section 7 for the item itself.

alter table items drop constraint if exists items_buyer_rule_check;
alter table items add constraint items_buyer_rule_check
  check (buyer_rule in ('any', 'bottom_4', 'game_winner'));
