import { db, CLIPS_BUCKET } from '@/lib/supabase';

export const MAX_CLIP_BYTES = 50 * 1024 * 1024;
/** Enough for a night; stops one phone filling the bucket. */
const MAX_CLIPS_PER_TEAM = 40;

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv', 'video/3gpp': '3gp' };

export type Clip = { id: string; blockId: string | null; caption: string | null; status: 'pending' | 'live' | 'hidden'; createdAt: string; url: string | null };

/**
 * Start an upload for a team. Returns a link the phone PUTs the video
 * to itself: the file never passes through this server, which couldn't
 * take one this size.
 */
export async function beginClip(eventId: string, blockId: string, file: { type: string; size: number }): Promise<{ ok: true; clipId: string; uploadUrl: string } | { ok: false; error: string }> {
  const type = String(file.type || '').split(';')[0].trim().toLowerCase();
  if (!EXT[type]) return { ok: false, error: 'That isn’t a video this can play. Film it with the phone’s camera.' };
  if (!(file.size > 0) || file.size > MAX_CLIP_BYTES) return { ok: false, error: 'That video is too big (50 MB at most). Keep it short.' };

  const supabase = db();
  const { count } = await supabase.from('clips').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('block_id', blockId);
  if ((count ?? 0) >= MAX_CLIPS_PER_TEAM) return { ok: false, error: 'That’s enough clips for one night.' };

  const path = `${eventId}/${blockId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${EXT[type]}`;
  const { data: signed, error } = await supabase.storage.from(CLIPS_BUCKET).createSignedUploadUrl(path);
  if (error || !signed) return { ok: false, error: 'Couldn’t start the upload. Try again.' };

  const { data: clip } = await supabase.from('clips').insert({ event_id: eventId, block_id: blockId, storage_path: path, content_type: type }).select('id').single();
  if (!clip) return { ok: false, error: 'Couldn’t start the upload. Try again.' };
  return { ok: true, clipId: clip.id as string, uploadUrl: signed.signedUrl };
}

/** The phone says its upload finished. The clip goes on the TV only if the file is really there. */
export async function confirmClip(clipId: string, blockId: string, caption: string): Promise<boolean> {
  const supabase = db();
  const { data: clip } = await supabase.from('clips').select('storage_path, status').eq('id', clipId).eq('block_id', blockId).maybeSingle();
  if (!clip || clip.status !== 'pending') return false;
  const path = clip.storage_path as string;
  const slash = path.lastIndexOf('/');
  const { data: found } = await supabase.storage.from(CLIPS_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  if (!found?.length) return false;
  await supabase.from('clips').update({ status: 'live', caption: caption.replace(/\s+/g, ' ').trim().slice(0, 80) || null }).eq('id', clipId);
  return true;
}

/** A party's clips, newest first, each with a link that plays for an hour. */
export async function listClips(eventId: string, { liveOnly = true, limit = 8 } = {}): Promise<Clip[]> {
  const supabase = db();
  let query = supabase.from('clips').select('id, block_id, caption, status, created_at, storage_path').eq('event_id', eventId).order('created_at', { ascending: false }).limit(limit);
  query = liveOnly ? query.eq('status', 'live') : query.neq('status', 'pending');
  const { data } = await query;
  const rows = (data ?? []) as { id: string; block_id: string | null; caption: string | null; status: Clip['status']; created_at: string; storage_path: string }[];
  if (!rows.length) return [];
  const { data: signed } = await supabase.storage.from(CLIPS_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 60 * 60);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ id: r.id, blockId: r.block_id, caption: r.caption, status: r.status, createdAt: r.created_at, url: urls.get(r.storage_path) ?? null }));
}

/** Host: take a clip off the TV, or put it back. The file is kept either way. */
export async function setClipHidden(eventId: string, clipId: string, hidden: boolean): Promise<void> {
  await db().from('clips').update({ status: hidden ? 'hidden' : 'live' }).eq('id', clipId).eq('event_id', eventId).neq('status', 'pending');
}
