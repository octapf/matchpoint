const { spawnSync } = require('node:child_process');

function run(cmd, args, extraEnv = {}) {
  return spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
}

// 1) USB port forward so the *phone* can reach your PC's localhost:3000
run('adb', ['reverse', 'tcp:3000', 'tcp:3000']);

// 2) Force the app to talk to the local API on the phone via adb reverse
// (Windows npm scripts run under cmd.exe, so we set env via Node instead of `EXPO_PUBLIC_API_URL=...`)
// Also force Metro port to avoid interactive prompts when 8081 is busy.
const res = run(
  'npx',
  ['expo', 'run:android', '--port', '8081'],
  {
    EXPO_PUBLIC_API_URL: 'http://localhost:3000',
    RCT_METRO_PORT: '8081',
  }
);
process.exit(res.status ?? 1);

