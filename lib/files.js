// Where Shot Cam videos live. On Vercel: a Vercel Blob store (BLOB_READ_WRITE_TOKEN).
// Locally (npm start): a clips/ folder next to the state file, served at /clips.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ConfigError } = require('./store');

const EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv' };
const extFor = (type) => EXT[String(type).split(';')[0].trim()] || 'mp4';
const name = (type) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extFor(type)}`;

// Vercel functions accept request bodies up to about 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024 + 300 * 1024;

function blobFiles(token) {
  const { put, del } = require('@vercel/blob');
  return {
    async save(body, type) {
      const blob = await put(`clips/${name(type)}`, body, { access: 'public', contentType: String(type).split(';')[0], token });
      return blob.url;
    },
    async remove(url) {
      if (/\.blob\.vercel-storage\.com\//.test(url)) await del(url, { token });
    },
  };
}

function localFiles(dir) {
  return {
    dir,
    async save(body, type) {
      fs.mkdirSync(dir, { recursive: true });
      const file = name(type);
      fs.writeFileSync(path.join(dir, file), body);
      return `/clips/${file}`;
    },
    async remove(url) {
      const file = path.basename(String(url));
      if (String(url).startsWith('/clips/')) fs.rmSync(path.join(dir, file), { force: true });
    },
  };
}

function createFiles(env = process.env) {
  if (env.BLOB_READ_WRITE_TOKEN) return blobFiles(env.BLOB_READ_WRITE_TOKEN);
  if (env.VERCEL) {
    return {
      save: async () => {
        throw new ConfigError('Shot Cam needs a Vercel Blob store: connect one to this project (Storage tab → Blob), then redeploy.');
      },
      remove: async () => {},
    };
  }
  const stateFile = env.DATA_FILE || path.join(__dirname, '..', 'data', 'state.json');
  return localFiles(path.join(path.dirname(stateFile), 'clips'));
}

module.exports = { createFiles, MAX_BYTES };
