import { spawn } from 'node:child_process';

const timeoutMs = 120_000;
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  '--yes',
  'wrangler@4',
  'deploy',
  '--dry-run',
  '--config',
  'worker/wrangler.toml'
];

const child = spawn(command, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
  env: {
    ...process.env,
    CI: process.env.CI || '1',
    WRANGLER_SEND_METRICS: 'false'
  }
});

let dryRunCompleted = false;
let forceKillTimeout;

function terminateChild(signal = 'SIGTERM') {
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function handleOutput(chunk, stream) {
  const text = chunk.toString();
  stream.write(chunk);
  if (text.includes('--dry-run: exiting now.')) {
    dryRunCompleted = true;
    terminateChild();
    forceKillTimeout = setTimeout(() => {
      terminateChild('SIGKILL');
    }, 500);
  }
}

child.stdout.on('data', chunk => handleOutput(chunk, process.stdout));
child.stderr.on('data', chunk => handleOutput(chunk, process.stderr));

const timeout = setTimeout(() => {
  terminateChild();
  console.error(`Worker dry-run check timed out after ${timeoutMs / 1000} seconds.`);
  process.exitCode = 1;
}, timeoutMs);

child.on('error', (error) => {
  clearTimeout(timeout);
  clearTimeout(forceKillTimeout);
  console.error(`Failed to start Worker dry-run check: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  clearTimeout(forceKillTimeout);
  if (dryRunCompleted) {
    process.exitCode = 0;
    return;
  }
  if (signal) {
    process.exitCode = process.exitCode || 1;
    return;
  }
  process.exitCode = code ?? 1;
});
