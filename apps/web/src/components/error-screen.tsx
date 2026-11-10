import { Button } from '@base-ui/react/button';
import { useTranslation } from 'react-i18next';
import { ExtensionMissingError } from '../lib/transport/index.ts';

export function ErrorScreen({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const missing = error instanceof ExtensionMissingError;
  return (
    <div
      role="alert"
      data-testid="error-screen"
      className="mx-auto mt-24 flex max-w-md flex-col items-center gap-4 rounded-card border border-line bg-surface p-8 text-center"
    >
      <h1 className="text-xl font-semibold">
        {missing
          ? t('error.extensionMissing.title')
          : t('error.unreachable.title')}
      </h1>
      <p className="text-ink-muted">
        {missing
          ? t('error.extensionMissing.body')
          : t('error.unreachable.body')}
      </p>
      <Button
        data-testid="error:retry"
        onClick={onRetry}
        className="min-h-11 rounded-md bg-accent px-5 font-medium text-accent-ink"
      >
        {t('common.retry')}
      </Button>
    </div>
  );
}
