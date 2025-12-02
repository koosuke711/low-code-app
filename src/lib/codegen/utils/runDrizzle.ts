import { spawn } from 'node:child_process';

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: false
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

export async function runDrizzle() {
  await run('npx', ['drizzle-kit', 'generate:sqlite', '--config', 'drizzle.config.ts']);
  await run('npx', ['drizzle-kit', 'push:sqlite', '--config', 'drizzle.config.ts']);
}
