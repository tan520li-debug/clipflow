import { spawn } from 'node:child_process';

const proxy =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy;
const env = { ...process.env, NODE_ENV: 'production' };
if (proxy && !env.NODE_USE_ENV_PROXY) {
  env.NODE_USE_ENV_PROXY = '1';
}

const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
