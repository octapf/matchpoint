const { spawnSync } = require('node:child_process');

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: true });
}

// Makes the physical device reach your PC's localhost over USB.
// Required for dev API default: http://localhost:3000
const res = run('adb', ['reverse', 'tcp:3000', 'tcp:3000']);
if (res.status !== 0) {
  // Don't hard-fail: the user might be on emulator (10.0.2.2), Wi‑Fi, or no device yet.
  console.warn('\n[adb-reverse] No se pudo ejecutar `adb reverse tcp:3000 tcp:3000`.');
  console.warn('[adb-reverse] Si estás con teléfono físico por USB, habilitá Depuración USB y conectá el dispositivo.');
}

