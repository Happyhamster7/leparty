// Where Shot Cam videos live. On Vercel: a Vercel Blob store (BLOB_READ_WRITE_TOKEN); phones upload
// straight to it with a short-lived token, so videos never pass through a size-capped function.
// Locally (npm start): phones POST the video to /api/clip and it lands in a clips/ folder, served at /clips.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ConfigError } = require('./store');

const EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv' };
const extFor = (type) => EXT[String(type).split(';')[0].trim()] || 'mp4';
const name = (type) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extFor(type)}`;

const MAX_BYTES = 60 * 1024 * 1024;
const BLOB_URL = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/clips\//i;

function blobFiles(token) {
  const { put, del } = require('@vercel/blob');
  const { handleUpload } = require('@vercel/blob/client');
  return {
    mode: 'blob',
    owns: (url) => BLOB_URL.test(String(url)),
    // Answers the browser uploader's token request; authorize() throws if this player can't post a clip.
    async token(req, body, authorize) {
      return handleUpload({
        token,
        request: req,
        body,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          if (!String(pathname).startsWith('clips/')) throw new Error('Clips only.');
          const playerId = await authorize(JSON.parse(clientPayload || '{}').player);
          return { allowedContentTypes: ['video/*'], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: playerId };
        },
      });
    },
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
    mode: 'local',
    dir,
    owns: (url) => /^\/clips\/[\w.-]+$/.test(String(url)),
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
      mode: 'off',
      owns: () => false,
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
