import { createFileRoute } from '@tanstack/react-router';
import { useRedirectWhenSignedIn } from '../components/auth/use-redirect-when-signed-in.ts';
import { AuthLayout } from '../components/auth/auth-layout.tsx';
import { SignUpForm } from '../components/auth/sign-up-form.tsx';

export const Route = createFileRoute('/sign-up')({ component: SignUpPage });

function SignUpPage() {
  useRedirectWhenSignedIn();
  return (
    <AuthLayout>
      <SignUpForm />
    </AuthLayout>
  );
}
