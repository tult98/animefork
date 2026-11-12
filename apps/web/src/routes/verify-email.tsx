import { createFileRoute } from '@tanstack/react-router';
import { AuthLayout } from '../components/auth/auth-layout.tsx';
import { VerifyEmailStatus } from '../components/auth/verify-email-status.tsx';

export const Route = createFileRoute('/verify-email')({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  return (
    <AuthLayout>
      <VerifyEmailStatus />
    </AuthLayout>
  );
}
