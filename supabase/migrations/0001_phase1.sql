-- LeParty — phase 1 (signup platform)
-- Covers: people, events, participants, blocks.
-- Game tables (days, games, purchases, drinks, ledger_entries, items,
-- substitutes, wildcards) are phase 2 and deliberately absent.

create extension if not exists "pgcrypto" with schema "extensions";

-- ---------------------------------------------------------------------
-- people — the only table that persists between parties
-- ---------------------------------------------------------------------
create table if not exists people (
  id             uuid primary key default gen_random_uuid(),
  display_name   text not null,
  capacity_band  int  check (capacity_band between 1 and 5),
  profile_token  text unique not null default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- events — one party
-- ---------------------------------------------------------------------
create table if not exists events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  theme_key        text not null default 'jail',
  theme_title      text,
  theme_blurb      text,
  dress_code       text,
  dress_code_notes text,
  venue            text,
  held_on          date,
  starts_at_label  text,
  status           text not null default 'draft'
                   check (status in ('draft','open','checkin','running','archived')),
  config           jsonb not null default '{
                      "block_count": 8,
                      "starting_sentence": 25,
                      "starting_commissary": 200,
                      "potluck_targets": {
                        "main": 6, "side": 6, "dessert": 4,
                        "snack": 6, "ice": 2, "mixer": 4
                      }
                    }'::jsonb,
  current_day      int  not null default 0,
  phase            text not null default 'intake',
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- blocks — created with the event so cards can be printed in advance
-- ---------------------------------------------------------------------
create table if not exists blocks (
  id                     uuid primary key default gen_random_uuid(),
  event_id               uuid not null references events(id) on delete cascade,
  name                   text not null,
  colour                 text not null default '#1D4ED8',
  join_token             text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  join_code              text not null,
  in_play                boolean not null default false,
  charge                 text,
  captain_participant_id uuid,
  created_at             timestamptz not null default now(),
  unique (event_id, name),
  unique (event_id, join_code)
);

create index if not exists blocks_join_token_idx on blocks (join_token);

-- ---------------------------------------------------------------------
-- participants — a person at one event
-- ---------------------------------------------------------------------
create table if not exists participants (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  person_id          uuid not null references people(id) on delete cascade,
  block_id           uuid references blocks(id) on delete set null,
  invite_token       text unique not null default encode(extensions.gen_random_bytes(16), 'hex'),
  rsvp               text not null default 'pending'
                     check (rsvp in ('pending','yes','no')),
  potluck_item       text,
  potluck_category   text check (potluck_category in
                       ('main','side','dessert','snack','ice','mixer')),
  dietary_notes      text,
  photo_path         text,
  capacity_snapshot  int,
  inmate_number      int,
  checked_in_at      timestamptz,
  left_early         boolean not null default false,
  signup_completed_at timestamptz,
  created_at         timestamptz not null default now(),
  unique (event_id, person_id)
);

create index if not exists participants_event_idx on participants (event_id);
create index if not exists participants_token_idx on participants (invite_token);

-- Inmate numbers, unique per event, assigned on insert.
create or replace function assign_inmate_number() returns trigger as $$
begin
  if new.inmate_number is null then
    select coalesce(max(inmate_number), 4000) + 1
      into new.inmate_number
      from participants
     where event_id = new.event_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists participants_inmate_number on participants;
create trigger participants_inmate_number
  before insert on participants
  for each row execute function assign_inmate_number();

-- ---------------------------------------------------------------------
-- Row level security
--
-- Every read and write in this app goes through server-side code using
-- the service role key, which bypasses RLS. These policies exist so
-- that the anon and authenticated keys can do nothing at all: if the
-- anon key ever leaks into client code, it reaches no data.
-- ---------------------------------------------------------------------
alter table people       enable row level security;
alter table events       enable row level security;
alter table blocks       enable row level security;
alter table participants enable row level security;

-- No policies are created on purpose. RLS with zero policies denies
-- everything to anon and authenticated roles.

-- ---------------------------------------------------------------------
-- Storage bucket for mugshots (private; served through signed URLs)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('mugshots', 'mugshots', false)
on conflict (id) do nothing;
