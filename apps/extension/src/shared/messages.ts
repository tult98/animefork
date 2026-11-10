import { defineExtensionMessaging } from '@webext-core/messaging';

import type { RequestOption, RequestResponse } from './types';

export interface Protocol {
  'http:request'(req: RequestOption): RequestResponse;
  'http:aborted'(detail: { signalId: string }): void;
  tabs(detail: { type: string; args: unknown[] }): unknown;
  'set:referrers'(referrers: Record<string, string>): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<Protocol>();
