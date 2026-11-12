import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { verifyEmail, type AuthResult } from '../../lib/auth/client.ts';
import { authCopy } from '../../lib/auth/copy.ts';
import { ErrorAlert } from '../ui/alert.tsx';
import { KIND_CLASS, TONE_CLASS } from '../ui/button.tsx';
import { LoaderCircle } from '../ui/icons.ts';

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
      <div className="af-auth-card" role="status">
        <LoaderCircle aria-hidden="true" className="size-8 animate-spin" />
        <p className="af-auth-sub">{authCopy.verify.verifying}</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="af-auth-card">
        <h1 className="af-auth-title">{authCopy.verify.successTitle}</h1>
        <p className="af-auth-sub">{authCopy.verify.successBody}</p>
        <Link
          to="/sign-in"
          className={`${KIND_CLASS.rect} ${TONE_CLASS.rect.primary} af-btn--block`}
        >
          {authCopy.verify.toSignIn}
        </Link>
      </div>
    );
  }

  return (
    <div className="af-auth-card">
      <h1 className="af-auth-title">{authCopy.verify.failedTitle}</h1>
      <ErrorAlert>
        {status === 'invalid'
          ? authCopy.verify.failedBody
          : authCopy.verify.retryBody}
      </ErrorAlert>
      <Link to="/sign-up" className="af-link font-semibold">
        {authCopy.verify.toSignUp}
      </Link>
    </div>
  );
}
