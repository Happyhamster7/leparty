-- 0013 — clips: short videos a team films on its phone, for the TV.
--
-- A core feature: it works with or without a game. The video itself
-- goes from the phone straight to the private `clips` storage bucket
-- through a signed upload URL; this table is the record of it.
--
-- Additive. (An earlier `clips` table, tied to the retired game, was
-- dropped in 0010. The bucket has been there since 0006.)

create table if not exists clips (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  -- The team whose phone filmed it.
  block_id     uuid references blocks(id) on delete set null,
  storage_path text not null unique,
  content_type text not null,
  caption      text,
  -- pending: a signed URL was issued, the upload hasn't been confirmed.
  -- live: on the TV. hidden: taken off by a host (the file is kept).
  status       text not null default 'pending' check (status in ('pending', 'live', 'hidden')),
  created_at   timestamptz not null default now()
);

create index if not exists clips_event_idx on clips (event_id, created_at desc);

alter table clips enable row level security;

-- The bucket stays private; the TV plays clips through short-lived
-- signed links. Cap what it will accept: video only, 50 MB.
insert into storage.buckets (id, name, public) values ('clips', 'clips', false) on conflict (id) do nothing;
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/3gpp']
 where id = 'clips';
