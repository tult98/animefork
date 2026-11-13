import {
  DeepSeekTranslator,
  TITLE_TRANSLATION_PROMPT,
  type OverviewTranslator,
} from '../art/translator.ts';
import type { DeepSeekConfig } from '../art/art.config.ts';

export interface EpisodeTranslators {
  title: OverviewTranslator;
}

export function createEpisodeTranslators(
  config: DeepSeekConfig,
): EpisodeTranslators {
  return {
    title: new DeepSeekTranslator({
      ...config,
      prompt: TITLE_TRANSLATION_PROMPT,
      tag: 'title',
    }),
  };
}
