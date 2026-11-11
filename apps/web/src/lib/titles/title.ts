import { z } from 'zod';

export const TitleSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  image: z.string().min(1),
  backdrop: z.string().min(1).optional(),
  rating: z.number().min(0).max(10),
  episodeLabel: z.string().min(1),
  year: z.number().int().optional(),
  genres: z.array(z.string().min(1)).default([]),
  description: z.string().min(1).optional(),
  studio: z.string().min(1).optional(),
  views: z.number().int().nonnegative().optional(),
  quality: z.string().min(1).optional(),
  avsVoters: z.number().int().nonnegative().optional(),
});

export type Title = z.infer<typeof TitleSchema>;

export const TitleListSchema = z.array(TitleSchema).min(1);
