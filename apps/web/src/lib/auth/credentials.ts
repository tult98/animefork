import {
  CredentialsSchema,
  type Credentials,
} from '../../../../api/src/auth/contract.ts';

export interface CredentialIssues {
  email?: 'invalid';
  password?: 'short' | 'long';
}

// The same schema the API applies, so a form that passes here is never answered with a 400.
export function checkCredentials(
  email: string,
  password: string,
):
  | { ok: true; credentials: Credentials }
  | { ok: false; issues: CredentialIssues } {
  const parsed = CredentialsSchema.safeParse({ email, password });
  if (parsed.success) return { ok: true, credentials: parsed.data };
  const issues: CredentialIssues = {};
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === 'email') issues.email = 'invalid';
    else if (issue.path[0] === 'password') {
      issues.password = issue.code === 'too_big' ? 'long' : 'short';
    }
  }
  return { ok: false, issues };
}
