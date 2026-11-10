import { StreamUnavailableError } from './errors.ts';
import type { ResolvedStream } from './source.ts';

// The extension matches this fragment on every hls.js request to set Referer and CORS.
const EXTENSION_TAG = '#animevsub-vsub_extrao';
const MAX_NETWORK_RETRIES = 3;
const MEDIA_RECOVERY_WINDOW_MS = 1_000;

export interface AttachOptions {
  onFatal: (message: string) => void;
}

// Returns the teardown. A progressive file is just the element's src, an HLS stream goes through hls.js.
export async function attachStream(
  video: HTMLVideoElement,
  stream: ResolvedStream,
  { onFatal }: AttachOptions,
): Promise<() => void> {
  if (stream.kind === 'mp4') {
    video.src = stream.url;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }

  const { HlsPatched } = await import('./hls-patched.ts');
  if (!HlsPatched.isSupported()) {
    throw new StreamUnavailableError('This browser cannot play HLS.');
  }
  const hls = new HlsPatched({
    progressive: true,
    fetchSetup(context, init) {
      context.url += EXTENSION_TAG;
      return new Request(context.url, init);
    },
  });

  let networkRetries = 0;
  let swapCodecNext = false;
  let swapTimer: number | undefined;
  hls.on(HlsPatched.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    if (data.type === HlsPatched.ErrorTypes.NETWORK_ERROR) {
      if (networkRetries++ < MAX_NETWORK_RETRIES) hls.startLoad();
      else onFatal('network');
    } else if (data.type === HlsPatched.ErrorTypes.MEDIA_ERROR) {
      // A second fatal media error within the window means plain recovery was not enough, so the audio codec is swapped too.
      window.clearTimeout(swapTimer);
      if (swapCodecNext) {
        hls.swapAudioCodec();
        swapCodecNext = false;
      } else {
        swapCodecNext = true;
        swapTimer = window.setTimeout(() => {
          swapCodecNext = false;
        }, MEDIA_RECOVERY_WINDOW_MS);
      }
      hls.recoverMediaError();
    } else {
      onFatal(data.details);
    }
  });
  hls.loadSource(stream.url);
  hls.attachMedia(video);
  return () => {
    window.clearTimeout(swapTimer);
    hls.destroy();
  };
}
