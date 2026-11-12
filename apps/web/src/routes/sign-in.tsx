import { createFileRoute } from '@tanstack/react-router';
import { useRedirectWhenSignedIn } from '../components/auth/use-redirect-when-signed-in.ts';
import { AuthLayout } from '../components/auth/auth-layout.tsx';
import { SignInForm } from '../components/auth/sign-in-form.tsx';

export const Route = createFileRoute('/sign-in')({ component: SignInPage });

function SignInPage() {
  useRedirectWhenSignedIn();
  return (
    <AuthLayout>
      <SignInForm />
    </AuthLayout>
  );
}
