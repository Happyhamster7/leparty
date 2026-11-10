// Where the game state lives between requests.
// On Vercel every request may hit a fresh function instance, so state goes to Upstash Redis.
// Locally (npm start) it stays in memory and is mirrored to a JSON file.
// Both stores hand out a version number; save() only succeeds if nobody else saved in between.
const fs = require('fs');
const path = require('path');

const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if (cur or '0') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[3])
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

// Thrown when the deployment is missing its database settings; shown to whoever opens the app.
class ConfigError extends Error {}

class RedisStore {
  constructor({ url, token, key = 'sss' }) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.vKey = `${key}:v`;
    this.sKey = `${key}:s`;
  }

  async call(path, body) {
    const res = await fetch(`${this.url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(`Redis: ${json.error || res.status}`);
    return json;
  }

  async version() {
    const { result } = await this.call('/', ['GET', this.vKey]);
    return Number(result || 0);
  }

  async load() {
    const [v, s] = await this.call('/pipeline', [
      ['GET', this.vKey],
      ['GET', this.sKey],
    ]);
    return { version: Number(v.result || 0), state: s.result ? JSON.parse(s.result) : null };
  }

  async save(state, expectedVersion) {
    const next = expectedVersion + 1;
    const { result } = await this.call('/', ['EVAL', CAS_SCRIPT, '2', this.vKey, this.sKey, String(expectedVersion), String(next), JSON.stringify(state)]);
    return result === 1 ? next : null;
  }
}

class FileStore {
  constructor({ file }) {
    this.file = file;
    this.state = null;
    this.ver = 0;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Older saves are the bare state; newer ones carry their version.
      this.state = saved.state && saved.version ? saved.state : saved;
      this.ver = saved.version || 1;
    } catch {}
    this.timer = null;
  }

  async version() {
    return this.ver;
  }

  async load() {
    return { version: this.ver, state: this.state && structuredClone(this.state) };
  }

  async save(state, expectedVersion) {
    if (expectedVersion !== this.ver) return null;
    this.state = structuredClone(state);
    this.ver++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
    return this.ver;
  }

  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: this.ver, state: this.state }));
    fs.renameSync(tmp, this.file);
  }
}

// Vercel's Upstash Redis integration sets KV_REST_API_*; a direct Upstash database sets UPSTASH_REDIS_REST_*.
function createStore(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new RedisStore({ url, token, key: env.STATE_KEY || 'sss' });
  if (env.VERCEL) throw new ConfigError('Setup needed: connect an Upstash Redis database to this Vercel project (Storage tab), then redeploy.');
  return new FileStore({ file: env.DATA_FILE || path.join(__dirname, '..', 'data', 'state.json') });
}

module.exports = { createStore, RedisStore, FileStore, ConfigError };
