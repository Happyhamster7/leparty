-- 0011 — game sessions: where a running game keeps its state.
--
-- A game module (src/modules) keeps one JSON document per session and
-- changes it only through its reducer. These two tables and one
-- function are everything a game needs from the database, whatever the
-- game is. See docs/rework-plan.md.
--
-- Additive: nothing existing is changed or dropped.

create table if not exists game_sessions (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  -- Which module in src/modules owns `state`.
  module_key       text not null,
  status           text not null default 'active' check (status in ('active', 'archived')),
  -- The module's document. Opaque to SQL on purpose.
  state            jsonb not null,
  -- The module's own schema version for `state`, so it can migrate old documents.
  schema_version   int  not null,
  -- Bumped by every change. A writer must say which version it read.
  version          int  not null default 0,
  -- When the game's clock next needs a nudge, so a poll can tell
  -- without reading the document. Null means nothing is pending.
  next_deadline_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists game_sessions_event_idx on game_sessions (event_id);

-- One game runs at a time: a party's phones and TV can only show one.
create unique index if not exists game_sessions_one_active_idx
  on game_sessions (event_id) where status = 'active';

-- Every change to a session, in order. Append-only: the audit trail,
-- and what makes a double tap harmless.
create table if not exists game_actions (
  id               bigint generated always as identity primary key,
  session_id       uuid not null references game_sessions(id) on delete cascade,
  -- Minted by the sender, once per tap. The same id twice is the same
  -- tap twice, and only the first is applied. Null for the clock.
  client_action_id text,
  actor_role       text not null check (actor_role in ('host', 'bar', 'team', 'system')),
  actor_team_id    uuid references blocks(id) on delete set null,
  type             text not null,
  args             jsonb not null default '{}'::jsonb,
  result           jsonb,
  -- The session version this action produced.
  version          int not null,
  -- The clock and the dice the reducer was given, so the action can be replayed.
  at_ms            bigint not null,
  seed             bigint not null,
  created_at       timestamptz not null default now(),
  unique (session_id, client_action_id),
  unique (session_id, version)
);

alter table game_sessions enable row level security;
alter table game_actions  enable row level security;

-- Save a new state and log the action that made it, together or not at
-- all. Returns the new version, or null if someone else saved first
-- (the caller reloads and tries again). A repeated client_action_id
-- raises unique_violation, which undoes the save: the caller then
-- returns the first attempt's stored result.
create or replace function apply_game_action(
  p_session_id       uuid,
  p_expected_version int,
  p_state            jsonb,
  p_next_deadline_at timestamptz,
  p_client_action_id text,
  p_actor_role       text,
  p_actor_team_id    uuid,
  p_type             text,
  p_args             jsonb,
  p_result           jsonb,
  p_at_ms            bigint,
  p_seed             bigint
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next int;
begin
  update game_sessions
     set state = p_state,
         version = version + 1,
         next_deadline_at = p_next_deadline_at,
         updated_at = now()
   where id = p_session_id
     and version = p_expected_version
     and status = 'active'
  returning version into v_next;

  if v_next is null then
    return null;
  end if;

  insert into game_actions
    (session_id, client_action_id, actor_role, actor_team_id, type, args, result, version, at_ms, seed)
  values
    (p_session_id, p_client_action_id, p_actor_role, p_actor_team_id, p_type, coalesce(p_args, '{}'::jsonb), p_result, v_next, p_at_ms, p_seed);

  return v_next;
end;
$$;

-- Only the server (service role) may call it.
revoke all on function apply_game_action(uuid, int, jsonb, timestamptz, text, text, uuid, text, jsonb, jsonb, bigint, bigint) from public;
do $$
declare
  fn constant text := 'apply_game_action(uuid, int, jsonb, timestamptz, text, text, uuid, text, jsonb, jsonb, bigint, bigint)';
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute format('revoke all on function %s from anon', fn);
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute format('revoke all on function %s from authenticated', fn);
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute format('grant execute on function %s to service_role', fn);
  end if;
end;
$$;
