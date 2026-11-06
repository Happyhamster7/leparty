-- LeParty — bounty tracking (Open Bounty / Winner's Bounty)
-- Adds the multi-round tracking the bounty items need. See
-- docs/halloween-game-design.md section 7 and the "Implementation
-- note" there for the simplified rules actually built.

-- ---------------------------------------------------------------------
-- penalties — generalize the missed-time shot (qty 1, cheapest drink)
-- so a failed bounty can owe its own qty/drink type instead.
-- ---------------------------------------------------------------------
alter table penalties
  add column if not exists qty int,
  add column if not exists drink_type_id uuid references drink_types(id);

alter table penalties drop constraint if exists penalties_reason_check;
alter table penalties
  add constraint penalties_reason_check
  check (reason in ('missed_time', 'host', 'failed_bounty'));

-- ---------------------------------------------------------------------
-- ledger_entries — a dedicated reason for a bounty's reward payout,
-- distinct from a host-awarded 'bonus'.
-- ---------------------------------------------------------------------
alter table ledger_entries drop constraint if exists ledger_entries_reason_check;
alter table ledger_entries
  add constraint ledger_entries_reason_check
  check (reason in ('placing', 'bonus', 'star', 'item', 'drink_cost', 'drink_served', 'host_adjust', 'bounty'));

-- ---------------------------------------------------------------------
-- bounties — one row per purchase, tracking its multi-round window.
-- Resolved when the round at deadline_round_number closes its shop.
-- ---------------------------------------------------------------------
create table if not exists bounties (
  id                     uuid primary key default gen_random_uuid(),
  item_use_id            uuid not null references item_uses(id) on delete cascade,
  block_id               uuid not null references blocks(id) on delete cascade,
  event_id               uuid not null references events(id) on delete cascade,
  start_round_number     int not null,
  deadline_round_number  int not null,
  target_qty             int not null,
  -- Null means "any drink type" — the only target this app currently builds.
  target_drink_type_id   uuid references drink_types(id),
  reward_money           int not null,
  resolved_at            timestamptz,
  hit                    boolean,
  created_at             timestamptz not null default now()
);

create index if not exists bounties_block_idx on bounties (block_id);
create index if not exists bounties_resolution_idx on bounties (event_id, deadline_round_number) where resolved_at is null;

alter table bounties enable row level security;
