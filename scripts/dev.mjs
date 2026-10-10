// Runs the API (watch mode) and the web dev server together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

const tasks = [
  { name: 'api', color: '\x1b[36m', args: ['run', 'start:dev', '-w', 'apps/api'] },
  { name: 'web', color: '\x1b[35m', args: ['run', 'dev', '-w', 'apps/web'] },
];

const children = tasks.map(({ name, color, args }) => {
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = `${color}[${name}]\x1b[0m `;
  const relay = (stream, out) =>
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) if (line.trim()) out.write(`${prefix}${line}\n`);
    });
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
