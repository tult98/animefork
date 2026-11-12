import { fakeJev, type JevReply } from '../art/tmdb/jev-mock.ts';

export type MalJevReply = Pick<
  JevReply,
  'choice' | 'probabilities' | 'confidence' | 'noul'
>;

export function malJevResponse(reply: MalJevReply) {
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
    usage: { input_tokens: 400, output_tokens: 20 },
  };
}

export function fakeMalJev(
  answer: MalJevReply | (() => Response | Promise<Response>),
) {
  return fakeJev(
    typeof answer === 'function'
      ? answer
      : () => Response.json(malJevResponse(answer)),
  );
}
