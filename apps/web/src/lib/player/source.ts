export interface StreamRequest {
  id: string;
  play: string;
  hash: string;
}

export type StreamKind = 'hls' | 'mp4';

export interface ResolvedStream {
  url: string;
  kind: StreamKind;
}

export interface PlayerSource {
  resolve(
    episode: StreamRequest,
    signal?: AbortSignal,
  ): Promise<ResolvedStream>;
}
