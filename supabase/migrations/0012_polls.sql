-- 0012 — polls: a room-wide vote, with or without a game running.
--
-- The first kind is the costume vote: every phone picks its best and
-- worst costumes from the people who are here. A vote is one row per
-- phone, so fifty people voting at once never contend for anything.
--
-- Additive: nothing existing is changed or dropped.

create table if not exists polls (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  kind       text not null default 'costume' check (kind in ('costume')),
  -- open: taking votes, QR on the TV. closed: results on the TV.
  -- hidden: over, and off the TV.
  status     text not null default 'open' check (status in ('open', 'closed', 'hidden')),
  -- How many each phone may pick for best, and for worst.
  picks      int  not null default 3 check (picks between 1 and 5),
  -- Filled in when the poll closes, so the result can't shift afterwards.
  results    jsonb,
  opened_at  timestamptz not null default now(),
  closed_at  timestamptz
);

create index if not exists polls_event_idx on polls (event_id);

-- One poll on the TV at a time.
create unique index if not exists polls_one_showing_idx
  on polls (event_id) where status in ('open', 'closed');

create table if not exists poll_votes (
  poll_id    uuid not null references polls(id) on delete cascade,
  -- The phone's own id, from a cookie. One vote per phone; voting
  -- again replaces it.
  voter_id   text not null,
  best       uuid[] not null default '{}',
  worst      uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (poll_id, voter_id)
);

alter table polls      enable row level security;
alter table poll_votes enable row level security;
