-- LeParty — phase 2 (the game)
-- Adds the tables behind docs/halloween-game-design.md. See docs/schema.md
-- for the field-by-field design this mirrors.

-- ---------------------------------------------------------------------
-- blocks — phase 2 additions: the one team phone, latest scan wins
-- ---------------------------------------------------------------------
alter table blocks
  add column if not exists team_device_id text,
  add column if not exists team_device_claimed_at timestamptz;

-- ---------------------------------------------------------------------
-- acts — rounds are grouped into Acts
-- ---------------------------------------------------------------------
create table if not exists acts (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  number     int not null,
  name       text,
  created_at timestamptz not null default now(),
  unique (event_id, number)
);

-- ---------------------------------------------------------------------
-- games — the catalogue for one event
-- ---------------------------------------------------------------------
create table if not exists games (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  name           text not null,
  rules          text,
  format         text not null
                 check (format in ('per_team', 'team_relay', 'all_teams', 'head_to_head')),
  players_needed int,
  is_group       boolean not null default false,
  result_type    text not null
                 check (result_type in ('placings', 'score', 'winner', 'per_player')),
  created_at     timestamptz not null default now()
);

create index if not exists games_event_idx on games (event_id);

-- ---------------------------------------------------------------------
-- rounds — one game played; the heart of the state machine
-- ---------------------------------------------------------------------
create table if not exists rounds (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  act_id             uuid not null references acts(id) on delete cascade,
  number             int not null,
  game_id            uuid not null references games(id),
  phase              text not null default 'game'
                     check (phase in ('game', 'results', 'spending', 'drinks', 'done')),
  pick_deadline      timestamptz,
  picks_revealed_at  timestamptz,
  shop_closed_at     timestamptz,
  drinks_started_at  timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (event_id, number)
);

create index if not exists rounds_event_idx on rounds (event_id);
create index if not exists rounds_act_idx on rounds (act_id);

-- ---------------------------------------------------------------------
-- round_players — who played, for the reveal and for cooldowns
-- ---------------------------------------------------------------------
create table if not exists round_players (
  round_id       uuid not null references rounds(id) on delete cascade,
  block_id       uuid not null references blocks(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  picked_by      text not null check (picked_by in ('team', 'auto')),
  created_at     timestamptz not null default now(),
  primary key (round_id, participant_id)
);

create index if not exists round_players_participant_idx on round_players (participant_id);

-- ---------------------------------------------------------------------
-- game_results
-- ---------------------------------------------------------------------
create table if not exists game_results (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references rounds(id) on delete cascade,
  block_id   uuid not null references blocks(id) on delete cascade,
  "placing"  int,
  score      int,
  note       text,
  created_at timestamptz not null default now(),
  unique (round_id, block_id)
);

create index if not exists game_results_round_idx on game_results (round_id);

-- ---------------------------------------------------------------------
-- drink_types — catalogue for one event
-- ---------------------------------------------------------------------
create table if not exists drink_types (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  name       text not null,
  points     int not null default 0,
  cost       int not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

-- ---------------------------------------------------------------------
-- items and item_uses — placeholder shop catalogue
-- ---------------------------------------------------------------------
create table if not exists items (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  key             text not null,
  name            text not null,
  description     text,
  -- Pricing is decided to be a single flat value per item, but the actual
  -- numbers are still TBD (see docs/halloween-game-design.md section 11).
  -- Null means "not priced yet", distinct from a free item costing 0.
  price           int,
  buyer_rule      text not null default 'any' check (buyer_rule in ('any', 'bottom_4')),
  limit_per_round int,
  limit_per_night int,
  created_at      timestamptz not null default now(),
  unique (event_id, key)
);

create table if not exists item_uses (
  id                     uuid primary key default gen_random_uuid(),
  round_id               uuid not null references rounds(id) on delete cascade,
  block_id               uuid not null references blocks(id) on delete cascade,
  item_id                uuid not null references items(id),
  target_block_id        uuid references blocks(id),
  target_participant_id  uuid references participants(id),
  result                 jsonb,
  created_at             timestamptz not null default now()
);

create index if not exists item_uses_round_idx on item_uses (round_id);

-- ---------------------------------------------------------------------
-- penalties — created before drink_orders, which references it
-- ---------------------------------------------------------------------
create table if not exists penalties (
  id               uuid primary key default gen_random_uuid(),
  block_id         uuid not null references blocks(id) on delete cascade,
  from_round_id    uuid not null references rounds(id) on delete cascade,
  applies_round_id uuid references rounds(id) on delete set null,
  kind             text not null default 'extra_shot' check (kind in ('extra_shot')),
  reason           text not null check (reason in ('missed_time', 'host')),
  created_at       timestamptz not null default now()
);

create index if not exists penalties_block_idx on penalties (block_id);
create index if not exists penalties_unapplied_idx on penalties (block_id) where applies_round_id is null;

-- ---------------------------------------------------------------------
-- drink_orders — what a team phone writes during spending. Admin drinks
-- and penalty shots land here too, so the queue has one source.
-- ---------------------------------------------------------------------
create table if not exists drink_orders (
  id                   uuid primary key default gen_random_uuid(),
  round_id             uuid not null references rounds(id) on delete cascade,
  -- Null for admin and penalty drinks.
  sender_block_id      uuid references blocks(id),
  origin               text not null default 'team' check (origin in ('team', 'admin', 'penalty')),
  -- Always a team, never a named player.
  target_block_id      uuid not null references blocks(id),
  drink_type_id        uuid not null references drink_types(id),
  qty                  int not null check (qty > 0),
  status               text not null default 'pending'
                       check (status in ('pending', 'cancelled', 'reflected', 'served')),
  -- Set by Reflect to the reflecting team.
  scores_for_block_id  uuid references blocks(id),
  penalty_id           uuid references penalties(id),
  created_at           timestamptz not null default now()
);

create index if not exists drink_orders_round_target_idx on drink_orders (round_id, target_block_id);

-- ---------------------------------------------------------------------
-- serves — the drinks queue, one row per receiving team per round
-- ---------------------------------------------------------------------
create table if not exists serves (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references rounds(id) on delete cascade,
  block_id       uuid not null references blocks(id) on delete cascade,
  drink_count    int not null default 0,
  queue_position int not null,
  served_at      timestamptz,
  timer_ends_at  timestamptz,
  finished_at    timestamptz,
  finished_by    text check (finished_by in ('timer', 'host')),
  missed_time    boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (round_id, block_id)
);

create index if not exists serves_round_idx on serves (round_id);

-- ---------------------------------------------------------------------
-- clips — filmed at the bar, uploaded straight from the phone
-- ---------------------------------------------------------------------
create table if not exists clips (
  id            uuid primary key default gen_random_uuid(),
  serve_id      uuid not null references serves(id) on delete cascade,
  storage_path  text not null,
  upload_state  text not null default 'pending'
                check (upload_state in ('pending', 'uploaded', 'failed')),
  status        text not null default 'shown' check (status in ('shown', 'removed')),
  uploaded_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists clips_serve_idx on clips (serve_id);

-- ---------------------------------------------------------------------
-- ledger_entries — append-only. Every change to a team's money, points
-- or stars is a row. Balances are sum(delta), never stored.
-- ---------------------------------------------------------------------
create table if not exists ledger_entries (
  id         uuid primary key default gen_random_uuid(),
  block_id   uuid not null references blocks(id) on delete cascade,
  round_id   uuid references rounds(id) on delete set null,
  kind       text not null check (kind in ('money', 'points', 'stars')),
  delta      int not null,
  reason     text not null
             check (reason in ('placing', 'bonus', 'star', 'item', 'drink_cost', 'drink_served', 'host_adjust')),
  ref_id     uuid,
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_block_kind_idx on ledger_entries (block_id, kind);

-- ---------------------------------------------------------------------
-- Row level security — same policy as phase 1: enable with zero
-- policies, so the anon and authenticated keys reach nothing. All
-- access goes through server-side code using the service role key.
-- ---------------------------------------------------------------------
alter table acts          enable row level security;
alter table games          enable row level security;
alter table rounds         enable row level security;
alter table round_players  enable row level security;
alter table game_results   enable row level security;
alter table drink_types    enable row level security;
alter table items          enable row level security;
alter table item_uses      enable row level security;
alter table penalties      enable row level security;
alter table drink_orders   enable row level security;
alter table serves         enable row level security;
alter table clips          enable row level security;
alter table ledger_entries enable row level security;

-- ---------------------------------------------------------------------
-- Storage bucket for punishment clips (private; no conversion — see
-- docs/halloween-game-design.md section 6, "Video technical notes")
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('clips', 'clips', false)
on conflict (id) do nothing;
