export interface GetRequest {
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface PostRequest extends GetRequest {
  data?: Record<string, string | number | boolean>;
}

export interface TransportResponse {
  status: number;
  data: string;
}

export interface Transport {
  get(req: GetRequest): Promise<TransportResponse>;
  post(req: PostRequest): Promise<TransportResponse>;
}
