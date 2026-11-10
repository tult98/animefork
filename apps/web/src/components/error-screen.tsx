import { Button } from '@base-ui/react/button';
import { ExtensionMissingError } from '../lib/transport/index.ts';

export function ErrorScreen({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const missing = error instanceof ExtensionMissingError;
  return (
    <div
      role="alert"
      data-testid="error-screen"
      className="mx-auto mt-24 flex max-w-md flex-col items-center gap-4 rounded-card border border-line bg-surface p-8 text-center"
    >
      <h1 className="text-xl font-semibold">
        {missing ? 'Extension required' : 'The source is unreachable'}
      </h1>
      <p className="text-ink-muted">
        {missing
          ? 'Install and enable the AnimeVsub Helper extension, then retry.'
          : 'We could not load or read the data from the source.'}
      </p>
      <Button
        data-testid="error:retry"
        onClick={onRetry}
        className="min-h-11 rounded-md bg-accent px-5 font-medium text-accent-ink"
      >
        Retry
      </Button>
    </div>
  );
}
