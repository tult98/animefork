import {
  DeepSeekTranslator,
  SYNOPSIS_BATCH_PROMPT,
  TITLE_BATCH_PROMPT,
  TITLE_TRANSLATION_PROMPT,
  TRANSLATION_PROMPT,
  type OverviewTranslator,
} from '../art/translator.ts';
import type { DeepSeekConfig } from '../art/art.config.ts';

export interface EpisodeTranslators {
  title: OverviewTranslator;
  synopsis: OverviewTranslator;
}

export function createEpisodeTranslators(
  config: DeepSeekConfig,
): EpisodeTranslators {
  return {
    title: new DeepSeekTranslator({
      ...config,
      prompt: TITLE_TRANSLATION_PROMPT,
      batchPrompt: TITLE_BATCH_PROMPT,
      tag: 'title',
    }),
    synopsis: new DeepSeekTranslator({
      ...config,
      prompt: TRANSLATION_PROMPT,
      batchPrompt: SYNOPSIS_BATCH_PROMPT,
      tag: 'synopsis',
    }),
  };
}
