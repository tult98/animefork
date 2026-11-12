import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './contract.ts';

const users = new WeakMap<object, AuthUser>();

export function setCurrentUser(request: object, user: AuthUser): void {
  users.set(request, user);
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = users.get(context.switchToHttp().getRequest<object>());
    if (!user) {
      throw new Error('@CurrentUser() needs SessionGuard on the route');
    }
    return user;
  },
);
