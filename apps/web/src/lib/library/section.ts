import { z } from 'zod';

export const HISTORY = 'history';
export const LIKED = 'liked';
export const DISLIKED = 'disliked';

// A playlist id is any other string. The page falls back to history when no playlist has it.
export const LibrarySearchSchema = z.looseObject({
  section: z.string().min(1).catch(HISTORY).default(HISTORY),
});
