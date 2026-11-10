import { version } from '../../package.json';
import { base64ToArrayBuffer } from '../shared/base64';
import { encodeDetail } from '../shared/detail';
import { isFirefox } from '../shared/env';
import { HOST_MATCHES } from '../shared/hosts';
import { sendMessage } from '../shared/messages';
import type {
  DetailCustomEvent_sendToInject,
  RequestOption,
} from '../shared/types';

export default defineContentScript({
  matches: HOST_MATCHES,
  allFrames: true,
  runAt: 'document_start',
  main() {
    document.addEventListener('http:request', (async ({
      detail,
    }: CustomEvent<{
      id: string;
      req: RequestOption;
    }>) => {
      document.dispatchEvent(
        new CustomEvent<DetailCustomEvent_sendToInject>('http:response', {
          detail: encodeDetail(
            await sendMessage('http:request', detail.req)
              .then((res): DetailCustomEvent_sendToInject => {
                switch (detail.req.responseType) {
                  case 'arraybuffer':
                    res.data = isFirefox
                      ? (res.data as string)
                      : base64ToArrayBuffer(res.data as string);
                    break;
                  case 'json':
                    res.data = JSON.parse(res.data as string);
                    break;
                }

                return {
                  id: detail.id,
                  isBuffer:
                    isFirefox && detail.req.responseType === 'arraybuffer',
                  ok: true,
                  res,
                };
              })
              .catch((err) => {
                return {
                  id: detail.id,
                  ok: false,
                  res: err,
                };
              }),
          ),
        }),
      );
    }) as unknown as EventListenerOrEventListenerObject);
    document.addEventListener('http:aborted', (({
      detail: { signalId },
    }: CustomEvent<{ signalId: string }>) => {
      sendMessage('http:aborted', { signalId });
    }) as unknown as EventListenerOrEventListenerObject);
    document.addEventListener('tabs', (async ({
      detail,
    }: CustomEvent<{
      id: string;
      type: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: any;
    }>) => {
      document.dispatchEvent(
        new CustomEvent('tabs:response', {
          detail: encodeDetail(
            await sendMessage('tabs', detail)
              .then((res) => {
                return {
                  id: detail.id,
                  ok: true,
                  res,
                };
              })
              .catch((error) => {
                return {
                  id: detail.id,
                  ok: false,
                  res: error,
                };
              }),
          ),
        }),
      );
    }) as unknown as EventListenerOrEventListenerObject);
    document.addEventListener('set:referrers', (async ({
      detail,
    }: CustomEvent<{
      id: string;
      referrers: Record<string, string>;
    }>) => {
      await sendMessage('set:referrers', detail.referrers);
      document.dispatchEvent(
        new CustomEvent('res:set:referrers', {
          detail: encodeDetail({
            id: detail.id,
          }),
        }),
      );
    }) as unknown as EventListenerOrEventListenerObject);

    document.documentElement.dataset.httpVersion = version;
    document.documentElement.dataset.httpAllow = JSON.stringify(true);
    document.documentElement.dataset.tabsApi = JSON.stringify(true);
    document.documentElement.dataset.customReferer = JSON.stringify(true);
  },
});
