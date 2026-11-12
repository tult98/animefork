import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'artifacts', 'verify');

interface Step {
  name: string;
  args: string[];
  artifacts: string[];
}

const steps: Step[] = [
  {
    name: 'typecheck',
    args: ['tsc', '--noEmit'],
    artifacts: [],
  },
  {
    name: 'unit tests',
    args: [
      'vitest',
      'run',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${join(out, 'vitest.json')}`,
    ],
    artifacts: ['artifacts/verify/vitest.json'],
  },
];

function run(step: Step): Promise<{ ok: boolean; ms: number; log: string }> {
  const log = join(out, `${step.name.replace(/\s+/g, '-')}.log`);
  const sink = createWriteStream(log);
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn('pnpm', ['exec', ...step.args], {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    child.stdout.pipe(sink, { end: false });
    child.stderr.pipe(sink, { end: false });
    child.on('error', (err) => sink.write(`spawn failed: ${err.message}\n`));
    child.on('close', (code) => {
      sink.end();
      done({ ok: code === 0, ms: Date.now() - started, log });
    });
  });
}

await mkdir(out, { recursive: true });

const results = [];
for (const step of steps) {
  process.stdout.write(`running ${step.name} ... `);
  const result = await run(step);
  console.log(result.ok ? 'pass' : 'FAIL');
  results.push({ step, ...result });
}

const rel = (path: string) => relative(root, path);
console.log('\nverify summary');
for (const { step, ok, ms, log } of results) {
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${step.name} (${(ms / 1000).toFixed(1)}s)`,
  );
  console.log(`        log: apps/web/${rel(log)}`);
  for (const artifact of step.artifacts)
    console.log(`        artifact: apps/web/${artifact}`);
}

const passed = results.every((r) => r.ok);
console.log(`\n${passed ? 'VERIFY PASSED' : 'VERIFY FAILED'}`);
await writeFile(
  join(out, 'summary.json'),
  JSON.stringify(
    {
      passed,
      steps: results.map((r) => ({
        name: r.step.name,
        ok: r.ok,
        ms: r.ms,
        log: rel(r.log),
        artifacts: r.step.artifacts,
      })),
    },
    null,
    2,
  ),
);
process.exit(passed ? 0 : 1);
