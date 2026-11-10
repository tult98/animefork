import { createJevClient } from '../../../src/art/tmdb/jev.ts';

export const TEST_JEV = {
  apiKey: 'test-jev-key',
  model: 'jev-latest',
  minNoul: 0.85,
  minChoice: 0.85,
  minConfidence: 0.5,
};

export interface JevReply {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  noul: number;
}

export interface SentRequest {
  url: string;
  headers: Headers;
  body: unknown;
}

export function jevResponse(reply: JevReply) {
  return {
    model: 'jev-1.13.0',
    answers: {
      match: {
        type: 'choice',
        choice: reply.choice,
        confidence: reply.confidence,
        probabilities: reply.probabilities,
      },
      any_match: { type: 'noul', noul: reply.noul },
    },
    usage: { input_tokens: 400, output_tokens: 30 },
  };
}

export function fakeJev(
  answer: JevReply | Response | (() => Response | Promise<Response>),
) {
  const sent: SentRequest[] = [];
  const fetch = async (input: string, init?: RequestInit) => {
    sent.push({
      url: input,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    if (typeof answer === 'function') return answer();
    if (answer instanceof Response) return answer.clone();
    return Response.json(jevResponse(answer));
  };
  const client = createJevClient(TEST_JEV, {
    fetch,
    compression: false,
    logLevel: 'off',
    retry: { maxRetries: 0 },
  });
  return { client, sent };
}
