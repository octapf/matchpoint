const { spawnSync } = require('node:child_process');

function run(cmd, args, extraEnv = {}) {
  return spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
}

// Local admin bootstrap: ensures your account is treated as admin by the API when running `vercel dev`.
// This keeps organizer/admin UI controls enabled without needing to edit `.env` every time.
const ADMIN_EMAILS = process.env.ADMIN_EMAILS || 'frangipani.octavio@gmail.com';

const res = run('npx', ['vercel', 'dev', '--local-config', 'vercel.api.json'], { ADMIN_EMAILS });
process.exit(res.status ?? 1);

