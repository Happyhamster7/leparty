// Runs the end-to-end tests against a Supabase running on this machine.
//
//   supabase start        (once; needs Docker)
//   npm run e2e:local
//
// It reads the local Supabase's address and key, builds the app, starts
// it against that database, runs the tests, and stops the app. Nothing
// here can reach the live project: the tests refuse any database that
// isn't on this machine. Extra arguments go to Playwright, e.g.
//   npm run e2e:local -- e2e/game.spec.ts --headed
import { execSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3100;
const run = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

function supabaseEnv() {
  for (const bin of ['supabase', 'npx --yes supabase']) {
    try {
      const out = execSync(`${bin} status -o env`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      const vars = Object.fromEntries([...out.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)].map((m) => [m[1], m[2]]));
      if (vars.API_URL && vars.SERVICE_ROLE_KEY) return vars;
    } catch {
      // try the next way of finding the CLI
    }
  }
  console.error('No local Supabase found. Install the Supabase CLI and Docker, then run `supabase start` in this folder.');
  process.exit(1);
}

const sb = supabaseEnv();
const env = {
  NEXT_PUBLIC_SUPABASE_URL: sb.API_URL,
  SUPABASE_SERVICE_ROLE_KEY: sb.SERVICE_ROLE_KEY,
  HOST_PASSCODE: 'e2e-passcode',
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
  E2E_BASE_URL: `http://127.0.0.1:${PORT}`,
};

console.log(`\nTesting against the local Supabase at ${sb.API_URL}\n`);
run('npx next build', env);

// An app left over from an earlier run would be tested instead of this build.
if (await fetch(`http://127.0.0.1:${PORT}/signup`).then(() => true, () => false)) {
  console.error(`Something is already running on port ${PORT}. Stop it and run this again.`);
  process.exit(1);
}
// Started with node directly, not through npx or a shell, so stopping it stops the server itself.
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env: { ...process.env, ...env }, stdio: 'inherit' });
let code = 1;
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/signup`)).ok) break;
    } catch {
      // not up yet
    }
    if (i > 60) throw new Error('The app did not start.');
    await sleep(1000);
  }
  run(`npx playwright test ${process.argv.slice(2).join(' ')}`, env);
  code = 0;
} catch (err) {
  if (!err.status) console.error(err.message);
} finally {
  app.kill();
  if (process.platform === 'win32' && app.pid) {
    try {
      execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // already gone
    }
  }
}
process.exit(code);
