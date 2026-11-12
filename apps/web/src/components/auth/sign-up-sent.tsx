import { Link } from '@tanstack/react-router';
import { authCopy } from '../../lib/auth/copy.ts';
import { ErrorAlert, SuccessAlert } from '../ui/alert.tsx';
import { Mail } from '../ui/icons.ts';
import { StatusCard } from './status-card.tsx';

const LINK_BUTTON =
  'af-link cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold';

export function SignUpSent({
  email,
  resent,
  failure,
  resending,
  onResend,
  onChangeEmail,
}: {
  email: string;
  resent: boolean;
  failure: string | null;
  resending: boolean;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const copy = authCopy.signUp.sent;
  return (
    <StatusCard icon={Mail} tone="brand">
      <h1 className="af-auth-title">{copy.title}</h1>
      <p className="m-0 text-base/normal text-muted">{copy.lead}</p>
      <div className="rounded-sm bg-surface px-4 py-3 text-base/normal font-semibold break-all">
        {email}
      </div>
      <p className="m-0 text-base/normal text-muted">{copy.body}</p>
      {resent && (
        <SuccessAlert className="text-left">{copy.resent}</SuccessAlert>
      )}
      {failure && <ErrorAlert className="text-left">{failure}</ErrorAlert>}
      <p className="m-0 text-sm text-muted">
        {copy.didntGet}{' '}
        <button
          type="button"
          className={LINK_BUTTON}
          disabled={resending}
          onClick={onResend}
        >
          {resending ? copy.resending : copy.resend}
        </button>
      </p>
      <div className="af-auth-row mt-4 justify-center gap-6">
        <button type="button" className={LINK_BUTTON} onClick={onChangeEmail}>
          {copy.differentEmail}
        </button>
        <Link to="/sign-in" className="af-link text-sm">
          {copy.toSignIn}
        </Link>
      </div>
    </StatusCard>
  );
}
