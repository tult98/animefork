import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { signUp } from '../../lib/auth/client.ts';
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
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { pending, run } = useSubmitOnce();

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
      if (result.ok) setSentTo(checked.credentials.email);
      else setFailure(authErrorMessage(result.error));
    });
  };

  if (sentTo !== null) {
    return (
      <div className="af-auth-card">
        <h1 className="af-auth-title">{authCopy.signUp.sent.title}</h1>
        <p className="af-auth-sub">{authCopy.signUp.sent.body(sentTo)}</p>
        <p className="m-0 text-base/normal text-muted">
          {authCopy.signUp.sent.noMail}
        </p>
        <Link to="/sign-in" className="af-link font-semibold">
          {authCopy.signUp.sent.toSignIn}
        </Link>
      </div>
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
