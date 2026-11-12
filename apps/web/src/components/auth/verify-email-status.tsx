import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { verifyEmail, type AuthResult } from '../../lib/auth/client.ts';
import { authCopy } from '../../lib/auth/copy.ts';
import { ErrorAlert } from '../ui/alert.tsx';
import { KIND_CLASS, TONE_CLASS } from '../ui/button.tsx';
import { CircleAlert, CircleCheck, LoaderCircle } from '../ui/icons.ts';
import { StatusCard } from './status-card.tsx';

type Status = 'verifying' | 'success' | 'invalid' | 'unavailable';

function takeToken(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  // The token is single use and secret, so it leaves the address bar and history as soon as it is read.
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
  return token ? token : null;
}

function statusOf(result: AuthResult<null>): Status {
  if (result.ok) return 'success';
  return result.error.kind === 'invalid_token' ||
    result.error.kind === 'invalid_request'
    ? 'invalid'
    : 'unavailable';
}

export function VerifyEmailStatus() {
  const [status, setStatus] = useState<Status>('verifying');
  // StrictMode runs this effect twice, and a second POST would burn the token and turn success into failure.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeToken();
    const request: Promise<AuthResult<null>> = token
      ? verifyEmail(token)
      : Promise.resolve({ ok: false, error: { kind: 'invalid_token' } });
    void request.then((result) => setStatus(statusOf(result)));
  }, []);

  if (status === 'verifying') {
    return (
      <StatusCard icon={LoaderCircle} tone="brand" spin role="status">
        <p className="m-0 text-base/normal text-muted">
          {authCopy.verify.verifying}
        </p>
      </StatusCard>
    );
  }

  if (status === 'success') {
    return (
      <StatusCard icon={CircleCheck} tone="success">
        <h1 className="af-auth-title">{authCopy.verify.successTitle}</h1>
        <p className="m-0 text-base/normal text-muted">
          {authCopy.verify.successBody}
        </p>
        <Link
          to="/sign-in"
          className={`${KIND_CLASS.rect} ${TONE_CLASS.rect.primary} af-btn--block mt-2`}
        >
          {authCopy.verify.toSignIn}
        </Link>
      </StatusCard>
    );
  }

  return (
    <StatusCard icon={CircleAlert} tone="error">
      <h1 className="af-auth-title">{authCopy.verify.failedTitle}</h1>
      <ErrorAlert className="self-stretch text-left">
        {status === 'invalid'
          ? authCopy.verify.failedBody
          : authCopy.verify.retryBody}
      </ErrorAlert>
      <Link to="/sign-up" className="af-link font-semibold">
        {authCopy.verify.toSignUp}
      </Link>
    </StatusCard>
  );
}
