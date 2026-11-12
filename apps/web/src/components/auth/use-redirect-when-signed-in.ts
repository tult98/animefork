import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useSession } from '../../lib/auth/session.ts';

// Sign-in also lands here: it writes the session and this takes the visitor home.
export function useRedirectWhenSignedIn() {
  const session = useSession();
  const navigate = useNavigate();
  const signedIn = session.state === 'signedIn';
  useEffect(() => {
    if (signedIn) void navigate({ to: '/', replace: true });
  }, [signedIn, navigate]);
}
