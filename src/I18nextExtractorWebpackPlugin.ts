import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createFilter } from '@rollup/pluginutils';
import type { Rspack } from '@rsbuild/core';
import {
  getI18nextExtractorWebpackPluginHooks,
  type ExtractedTranslations,
} from './hooks.js';
import type { PluginI18nextExtractorOptions } from './options.js';
import {
  getLocalesFromDirectory,
  getLocaleVariableName,
  resolveLocaleFilePath,
} from './utils.js';

type LocaleTranslations = ExtractedTranslations;

const DEBUG = (function isDebug() {
  if (!process.env.DEBUG) {
    return false;
  }
  const values = process.env.DEBUG.toLocaleLowerCase().split(',');
  return ['rsbuild', 'rsbuild:i18next', 'rsbuild:*', '*'].some((key) =>
    values.includes(key),
  );
})();

interface I18nextExtractorWebpackPluginOptions
  extends PluginI18nextExtractorOptions {
  logger: { warn: (message: string) => void };
}

export class I18nextExtractorWebpackPlugin {
  constructor(private options: I18nextExtractorWebpackPluginOptions) {}

  apply(compiler: Rspack.Compiler): void {
    const { Compilation, sources } = compiler.webpack;

    // Create filter based on extract.ignore option
    const ignorePatterns = this.options.i18nextToolkitConfig?.extract?.ignore;
    const filter = createFilter(undefined, ignorePatterns, {
      resolve: compiler.context,
    });

    compiler.hooks.compilation.tap(this.constructor.name, (compilation) => {
      const hooks = getI18nextExtractorWebpackPluginHooks(compilation);

      const locales = getLocalesFromDirectory(
        compiler.context,
        this.options.localesDir,
      );

      if (locales.length === 0) {
        throw new Error(
          `[rsbuild-plugin-i18next-extractor] There is no "*.json" in ${this.options.localesDir}. Please check your "localesDir" option.`,
        );
      }

      compilation.hooks.processAssets.tapPromise(
        {
          name: this.constructor.name,
          stage: Compilation.PROCESS_ASSETS_STAGE_DERIVED,
        },
        async () => {
          // Process each entrypoint
          await Promise.all(
            [...compilation.entrypoints.entries()].map(
              async ([entryName, entrypoint]) => {
                // get entry chunk but not split chunk
                const jsFiles = entrypoint.chunks
                  .filter((chunk) => chunk.hasRuntime())
                  .flatMap((chunk) => Array.from(chunk.files))
                  .filter((file) => /\.(c|m)?js$/.test(file))
                  .map((file) => compilation.getAsset(file))
                  .filter((file) => !!file);

                const asyncJsFiles = compilation.chunkGroups
                  .filter((cg) => !cg.isInitial())
                  .filter((cg) =>
                    cg.getParents().some((p) => p.name === entryName),
                  )
                  .flatMap((cg) => cg.getFiles())
                  .filter((file) => /\.(c|m)?js$/.test(file))
                  .map((file) => compilation.getAsset(file))
                  .filter((file) => !!file);

                const targetAssetNames = [...jsFiles, ...asyncJsFiles].map(
                  (asset) => asset.name,
                );

                // Collect all the modules belong to current entry
                const entryModules = new Set<string>();
                for (const chunk of entrypoint.chunks) {
                  const modules =
                    compilation.chunkGraph.getChunkModulesIterable(chunk);
                  for (const m of modules) {
                    collectModules(m, entryModules);
                  }
                }
                // Only extract keys in js(x)/ts(x) files and apply ignore filter
                const files = Array.from(entryModules)
                  .filter((f) => /\.[jt]sx?$/.test(f))
                  .filter(filter);

                // Load origin translations
                const originTranslations: Record<string, LocaleTranslations> =
                  {};
                for (const locale of locales) {
                  const localePath = resolveLocaleFilePath(
                    this.options.localesDir,
                    locale,
                    compiler.context,
                  );
                  try {
                    const content = await fs.readFile(localePath, 'utf-8');
                    originTranslations[locale] = JSON.parse(
                      content,
                    ) as LocaleTranslations;
                  } catch {
                    throw new Error(
                      `[rsbuild-plugin-i18next-extractor] Failed to read locale file "${localePath}"`,
                    );
                  }
                }

                const { extractTranslationKeys } = await import(
                  './i18nextCLIExtractor.js'
                );
                const extractedTranslationKeys = await extractTranslationKeys(
                  files,
                  locales,
                  this.options.i18nextToolkitConfig,
                );

                const extractedTranslationsByLocale: Record<
                  string,
                  LocaleTranslations
                > = {};

                // Generate i18n resource definitions for each locale
                for (const locale of locales) {
                  const localeFilePath = resolveLocaleFilePath(
                    this.options.localesDir,
                    locale,
                    compiler.context,
                  );

                  const extractedTranslations = pickTranslationsByKeys(
                    originTranslations[locale],
                    extractedTranslationKeys[locale] ?? [],
                    (key) => {
                      // Use custom callback if provided, otherwise use default warning
                      if (this.options.onKeyNotFound) {
                        this.options.onKeyNotFound(
                          key,
                          locale,
                          localeFilePath,
                          entryName,
                        );
                      } else {
                        this.options.logger.warn(
                          `[rsbuild-plugin-i18next-extractor] The key "${key}" is not found in "${path.relative(
                            compiler.context,
                            localeFilePath,
                          )}". Current entry is "${entryName}".`,
                        );
                      }
                    },
                  );

                  extractedTranslationsByLocale[locale] = extractedTranslations;

                  // Write debug output to node_modules when DEBUG is enabled
                  if (DEBUG) {
                    try {
                      const debugDir = path.resolve(
                        compiler.context,
                        'node_modules',
                        '.rsbuild-plugin-i18next-extractor',
                        entryName,
                      );
                      await fs.mkdir(debugDir, { recursive: true });
                      const debugFilePath = path.join(
                        debugDir,
                        `${locale}.json`,
                      );
                      await fs.writeFile(
                        debugFilePath,
                        JSON.stringify(
                          {
                            locale,
                            entry: entryName,
                            extractedKeys: extractedTranslationKeys[locale],
                            extractedTranslations,
                            originTranslations: originTranslations[locale],
                          },
                          null,
                          2,
                        ),
                        'utf-8',
                      );
                      console.log(
                        `[rsbuild-plugin-i18next-extractor] Debug file written: ${path.relative(compiler.context, debugFilePath)}`,
                      );
                    } catch (error) {
                      console.warn(
                        `[rsbuild-plugin-i18next-extractor] Failed to write debug file for ${locale}:`,
                        error,
                      );
                    }
                  }
                }
                const afterExtractPayload = await hooks.afterExtract.promise({
                  entryName,
                  locales,
                  files,
                  extractedKeysByLocale: extractedTranslationKeys,
                  extractedTranslationsByLocale,
                });

                const i18nTranslationDefinitions: string[] = [];
                for (const locale of afterExtractPayload.locales) {
                  const variableName = getLocaleVariableName(locale);
                  const renderedPayload =
                    await hooks.renderExtractedTranslations.promise({
                      entryName: afterExtractPayload.entryName,
                      locale,
                      variableName,
                      extractedKeys:
                        afterExtractPayload.extractedKeysByLocale[locale] ?? [],
                      extractedTranslations:
                        afterExtractPayload.extractedTranslationsByLocale[
                          locale
                        ] ?? {},
                      targetAssetNames,
                      code: `const ${variableName} = ${JSON.stringify(
                        afterExtractPayload.extractedTranslationsByLocale[
                          locale
                        ] ?? {},
                      )};`,
                    });

                  if (renderedPayload.skip || !renderedPayload.code) {
                    continue;
                  }

                  i18nTranslationDefinitions.push(renderedPayload.code);
                }

                // Replace the placeholder with actual extracted translations
                for (const jsFile of [...jsFiles, ...asyncJsFiles]) {
                  const assetName = jsFile.name;
                  compilation.updateAsset(
                    assetName,
                    (oldSource) =>
                      new sources.ConcatSource(
                        i18nTranslationDefinitions.join('\n'),
                        '\n',
                        oldSource,
                      ),
                  );
                }
              },
            ),
          );
        },
      );
    });
  }
}

function collectModules<
  T extends Rspack.Module & { modules?: Rspack.Module[]; resource?: string },
>(m: T, entryModules: Set<string>): void {
  if (m.modules) {
    for (const innerModule of m.modules) {
      collectModules(innerModule, entryModules);
    }
  } else if (m.resource) {
    const resource = m.resource.split('?')[0];
    if (resource) {
      entryModules.add(resource);
    }
  }
}

/**
 * Combine the origin translations and the extracted translation keys.
 */
function pickTranslationsByKeys(
  originTranslations: ExtractedTranslations,
  extractedKeys: string[],
  onKeyNotFoundCallback: (key: string) => void,
): ExtractedTranslations {
  const result: ExtractedTranslations = {};
  for (const key of extractedKeys) {
    if (key in originTranslations) {
      result[key] = originTranslations[key];
    } else {
      onKeyNotFoundCallback(key);
      result[key] = '';
    }
  }
  return result;
}
