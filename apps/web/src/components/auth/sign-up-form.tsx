import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import type { Credentials } from '../../../../api/src/auth/contract.ts';
import { useSignUp } from '../../lib/auth/use-auth-calls.ts';
import {
  checkCredentials,
  type CredentialIssues,
} from '../../lib/auth/credentials.ts';
import { authCopy } from '../../lib/auth/copy.ts';
import { authErrorMessage } from '../../lib/auth/messages.ts';
import { ErrorAlert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { PasswordInput } from '../ui/password-input.tsx';
import { SignUpSent } from './sign-up-sent.tsx';
import { useSubmitOnce } from './use-submit-once.ts';

const HINT_ID = 'password-hint';

function passwordMessage(issue: CredentialIssues['password']) {
  if (issue === 'short') return authCopy.errors.passwordTooShort;
  if (issue === 'long') return authCopy.errors.passwordTooLong;
  return undefined;
}

export function SignUpForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [issues, setIssues] = useState<CredentialIssues>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<Credentials | null>(null);
  const [resent, setResent] = useState(false);
  const { pending, run } = useSubmitOnce();
  const signUp = useSignUp();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setFailure(null);
      const checked = checkCredentials(email, password);
      if (!checked.ok) {
        setIssues(checked.issues);
        return;
      }
      setIssues({});
      const result = await signUp(checked.credentials);
      if (result.ok) setSent(checked.credentials);
      else setFailure(authErrorMessage(result.error));
    });
  };

  // The API has no resend route, so a new link comes from signing up again with the same credentials.
  const onResend = () => {
    if (!sent) return;
    void run(async () => {
      setFailure(null);
      setResent(false);
      const result = await signUp(sent);
      if (result.ok) setResent(true);
      else setFailure(authErrorMessage(result.error));
    });
  };

  const onChangeEmail = () => {
    setSent(null);
    setResent(false);
    setFailure(null);
  };

  if (sent !== null) {
    return (
      <SignUpSent
        email={sent.email}
        resent={resent}
        failure={failure}
        resending={pending}
        onResend={onResend}
        onChangeEmail={onChangeEmail}
      />
    );
  }

  return (
    <form className="af-auth-card" noValidate onSubmit={onSubmit}>
      <h1 className="af-auth-title">{authCopy.signUp.title}</h1>
      <p className="af-auth-sub">{authCopy.signUp.subtitle}</p>
      {failure && <ErrorAlert>{failure}</ErrorAlert>}
      <Input
        fluid
        name="email"
        type="email"
        autoComplete="email"
        label={authCopy.fields.email}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={issues.email && authCopy.errors.invalidEmail}
      />
      <div>
        <PasswordInput
          fluid
          name="password"
          autoComplete="new-password"
          aria-describedby={HINT_ID}
          label={authCopy.fields.newPassword}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordMessage(issues.password)}
        />
        <p id={HINT_ID} className="m-0 mt-1 text-[13px]/[1.4] text-muted">
          {authCopy.signUp.passwordHint}
        </p>
      </div>
      <Button
        kind="rect"
        tone="primary"
        type="submit"
        disabled={pending}
        className="af-btn--block"
      >
        {pending ? authCopy.signUp.submitting : authCopy.signUp.submit}
      </Button>
      <p className="m-0 mt-4 text-base/normal text-muted">
        {authCopy.signUp.hasAccount}{' '}
        <Link to="/sign-in" className="af-link font-semibold">
          {authCopy.signUp.toSignIn}
        </Link>
      </p>
    </form>
  );
}
