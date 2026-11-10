import { TitleSchema } from 'catalog';
import { z } from 'zod';

export { TitleSchema, type Title } from 'catalog';

export const TitleListSchema = z.array(TitleSchema).min(1);
