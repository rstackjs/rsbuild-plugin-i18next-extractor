import type { Rspack } from '@rsbuild/core';
import { AsyncSeriesWaterfallHook } from '@rspack/lite-tapable';

export interface AfterExtractPayload {
  entryName: string;
  locales: string[];
  files: string[];
  extractedKeysByLocale: Record<string, string[]>;
  extractedTranslationsByLocale: Record<string, Record<string, string>>;
}

export interface RenderExtractedTranslationsPayload {
  entryName: string;
  locale: string;
  variableName: string;
  extractedKeys: string[];
  extractedTranslations: Record<string, string>;
  targetAssetNames: string[];
  code: string;
  skip?: boolean;
}

export interface I18nextExtractorWebpackPluginHooks {
  afterExtract: AsyncSeriesWaterfallHook<AfterExtractPayload>;
  renderExtractedTranslations: AsyncSeriesWaterfallHook<RenderExtractedTranslationsPayload>;
}

const compilationHooksMap = new WeakMap<
  Rspack.Compilation,
  I18nextExtractorWebpackPluginHooks
>();

export function getI18nextExtractorWebpackPluginHooks(
  compilation: Rspack.Compilation,
): I18nextExtractorWebpackPluginHooks {
  let hooks = compilationHooksMap.get(compilation);

  if (!hooks) {
    hooks = {
      afterExtract: new AsyncSeriesWaterfallHook<AfterExtractPayload>([
        'payload',
      ]),
      renderExtractedTranslations:
        new AsyncSeriesWaterfallHook<RenderExtractedTranslationsPayload>([
          'payload',
        ]),
    };
    compilationHooksMap.set(compilation, hooks);
  }

  return hooks;
}
