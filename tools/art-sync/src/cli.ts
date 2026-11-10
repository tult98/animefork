import { run } from './run.ts';

run(process.argv.slice(2), process.env).then(
  (report) => console.log(JSON.stringify(report, null, 2)),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
