import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
