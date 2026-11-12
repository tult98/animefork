import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { signIn } from '../../lib/auth/client.ts';
import {
  checkCredentials,
  readCredentialFields,
} from '../../lib/auth/credentials.ts';
import { authCopy } from '../../lib/auth/copy.ts';
import { authErrorMessage } from '../../lib/auth/messages.ts';
import { useSessionActions } from '../../lib/auth/session.ts';
import { ErrorAlert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { PasswordInput } from '../ui/password-input.tsx';
import { useSubmitOnce } from './use-submit-once.ts';

type Problem =
  | { kind: 'credentials' }
  | { kind: 'email' }
  | { kind: 'other'; message: string };

export function SignInForm() {
  const [problem, setProblem] = useState<Problem | null>(null);
  const { pending, run } = useSubmitOnce();
  const { setUser } = useSessionActions();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { email, password } = readCredentialFields(event.currentTarget);
    void run(async () => {
      const checked = checkCredentials(email, password);
      if (!checked.ok) {
        // A password outside 8 to 128 characters cannot match any account, so it reads as a mismatch.
        setProblem({ kind: checked.issues.email ? 'email' : 'credentials' });
        return;
      }
      setProblem(null);
      const result = await signIn(checked.credentials);
      if (result.ok) setUser(result.data);
      else if (result.error.kind === 'invalid_credentials') {
        setProblem({ kind: 'credentials' });
      } else {
        setProblem({ kind: 'other', message: authErrorMessage(result.error) });
      }
    });
  };

  const mismatch = problem?.kind === 'credentials';
  return (
    <form className="af-auth-card" noValidate onSubmit={onSubmit}>
      <h1 className="af-auth-title">{authCopy.signIn.title}</h1>
      <p className="af-auth-sub">{authCopy.signIn.subtitle}</p>
      {mismatch && (
        <ErrorAlert>{authCopy.errors.invalidCredentials}</ErrorAlert>
      )}
      {problem?.kind === 'other' && <ErrorAlert>{problem.message}</ErrorAlert>}
      <Input
        fluid
        name="email"
        type="email"
        autoComplete="email"
        label={authCopy.fields.email}
        error={
          mismatch ||
          (problem?.kind === 'email' && authCopy.errors.invalidEmail)
        }
      />
      <PasswordInput
        fluid
        name="password"
        autoComplete="current-password"
        label={authCopy.fields.password}
        error={mismatch}
      />
      <Button
        kind="rect"
        tone="primary"
        type="submit"
        disabled={pending}
        className="af-btn--block"
      >
        {pending ? authCopy.signIn.submitting : authCopy.signIn.submit}
      </Button>
      <p className="m-0 mt-4 text-base/normal text-muted">
        {authCopy.signIn.noAccount}{' '}
        <Link to="/sign-up" className="af-link font-semibold">
          {authCopy.signIn.toSignUp}
        </Link>
      </p>
    </form>
  );
}
