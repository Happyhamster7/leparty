// Reads LeParty's checked-in guests and blocks, server to server.
// LEPARTY_URL is the LeParty site (e.g. https://leparty.vercel.app); LEPARTY_SECRET matches
// LeParty's SSS_ROSTER_SECRET. Without both, the sync is off and hosts are told so.
function createLeParty(env = process.env, fetchImpl = globalThis.fetch) {
  const base = String(env.LEPARTY_URL || '').replace(/\/+$/, '');
  const secret = env.LEPARTY_SECRET || '';
  const configured = !!(base && secret);

  async function get(path) {
    if (!configured) throw new Error('The LeParty link isn’t set up: add LEPARTY_URL and LEPARTY_SECRET to this deployment.');
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, { headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    } catch {
      throw new Error('Couldn’t reach LeParty. Check LEPARTY_URL and try again.');
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('LeParty refused the secret: LEPARTY_SECRET must match LeParty’s SSS_ROSTER_SECRET.');
    if (res.status === 404 && path.includes('/roster')) throw new Error('LeParty has no event with that id.');
    if (!res.ok) throw new Error(`LeParty answered ${res.status}${body.error ? `: ${body.error}` : ''}.`);
    return body;
  }

  return {
    configured,
    events: async () => (await get('/api/sss/events')).events || [],
    roster: async (eventId) => get(`/api/sss/events/${encodeURIComponent(eventId)}/roster`),
  };
}

module.exports = { createLeParty };
