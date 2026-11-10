-- 0010 — retire the first Phase 2 game, add screen tokens.
--
-- The relational game built in 0006–0009 (rounds, orders, serves, a
-- ledger) is replaced by game modules that keep their own state; see
-- docs/rework-plan.md. Its code is gone, so its tables go too.
--
-- THIS DELETES DATA: every round, order, serve, clip record and ledger
-- entry from that game. Guests, parties, blocks and check-ins are not
-- touched. Run it once nothing you want to keep lives in those tables.
--
-- Kept on purpose: blocks.team_device_id / team_device_claimed_at (the
-- team phone claim is still used) and the `clips` storage bucket.

drop table if exists clips          cascade;
drop table if exists serves         cascade;
drop table if exists drink_orders   cascade;
drop table if exists bounties       cascade;
drop table if exists penalties      cascade;
drop table if exists item_uses      cascade;
drop table if exists items          cascade;
drop table if exists drink_types    cascade;
drop table if exists game_results   cascade;
drop table if exists round_players  cascade;
drop table if exists rounds         cascade;
drop table if exists games          cascade;
drop table if exists acts           cascade;
drop table if exists ledger_entries cascade;

alter table events
  drop column if exists winner_block_id,
  drop column if exists ended_at,
  drop column if exists current_day,
  drop column if exists phase;

alter table blocks
  drop column if exists bonus_points_per_drink;

-- Screens that aren't the host's: the TV and the bar. Each opens with
-- an unguessable link, so neither needs the host passcode and neither
-- can do what a host can.
alter table events
  add column if not exists display_token text unique
    default encode(extensions.gen_random_bytes(12), 'hex'),
  add column if not exists bar_token text unique
    default encode(extensions.gen_random_bytes(12), 'hex');

update events set display_token = encode(extensions.gen_random_bytes(12), 'hex') where display_token is null;
update events set bar_token     = encode(extensions.gen_random_bytes(12), 'hex') where bar_token is null;

alter table events
  alter column display_token set not null,
  alter column bar_token set not null;
