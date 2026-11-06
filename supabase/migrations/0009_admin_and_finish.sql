-- LeParty — night-end/winner confirmation, the permanent drink bonus,
-- admin manual adjustments, and bounty kind tracking.

-- ---------------------------------------------------------------------
-- events — night-end and the confirmed winner.
-- ---------------------------------------------------------------------
alter table events
  add column if not exists ended_at timestamptz,
  add column if not exists winner_block_id uuid references blocks(id);

-- ---------------------------------------------------------------------
-- blocks — Winner's Bounty's permanent reward: +1 point per drink
-- sent for the rest of the night, stacking per win.
-- ---------------------------------------------------------------------
alter table blocks
  add column if not exists bonus_points_per_drink int not null default 0;

-- ---------------------------------------------------------------------
-- bounties — which item this was, so resolution knows whether a hit
-- pays money (Open Bounty) or grants the permanent bonus (Winner's).
-- ---------------------------------------------------------------------
alter table bounties add column if not exists kind text;
update bounties set kind = 'open' where kind is null;
alter table bounties alter column kind set not null;
alter table bounties drop constraint if exists bounties_kind_check;
alter table bounties add constraint bounties_kind_check check (kind in ('open', 'winner'));

-- ---------------------------------------------------------------------
-- ledger_entries — a free-text note for manual adjustments, since
-- 'host_adjust' alone doesn't say why.
-- ---------------------------------------------------------------------
alter table ledger_entries add column if not exists note text;
