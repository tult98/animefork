import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { apiRequest, type ApiRequest } from './request.ts';

export interface ApiMutationVars<TBody> {
  body?: TBody;
  keepalive?: boolean;
}

export interface ApiMutationOptions<TBody, T> extends Omit<
  UseMutationOptions<T, Error, ApiMutationVars<TBody> | void>,
  'mutationFn'
> {
  method: NonNullable<ApiRequest['method']>;
  endpoint: string;
}

export function useApiMutation<TBody = void, T = unknown>({
  method,
  endpoint,
  ...options
}: ApiMutationOptions<TBody, T>): UseMutationResult<
  T,
  Error,
  ApiMutationVars<TBody> | void
> {
  return useMutation({
    ...options,
    mutationFn: (vars) =>
      apiRequest<T>(endpoint, {
        method,
        body: vars?.body,
        keepalive: vars?.keepalive,
      }),
  });
}
