import { ExtensionMissingError } from '../lib/transport/index.ts';
import { Button } from './ui/button.tsx';

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
      className="mx-auto mt-24 flex max-w-md flex-col items-center gap-4 rounded-lg border border-border-strong bg-surface p-8 text-center"
    >
      <h1 className="text-xl font-semibold">
        {missing ? 'Extension required' : 'The source is unreachable'}
      </h1>
      <p className="text-muted">
        {missing
          ? 'Install and enable the Animefork Helper extension, then retry.'
          : 'We could not load or read the data from the source.'}
      </p>
      <Button
        kind="pill"
        tone="brand"
        data-testid="error:retry"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}
