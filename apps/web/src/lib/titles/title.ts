import { z } from 'zod';

// Minimal shape for PR 1 only. The real Title schema and parsers arrive with packages/catalog.
export const TitleSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  rating: z.number().min(0).max(10),
  episodeLabel: z.string().min(1),
  image: z.string().min(1),
});

export type Title = z.infer<typeof TitleSchema>;

export const TitleListSchema = z.array(TitleSchema).min(1);
