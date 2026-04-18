/** biome-ignore-all lint/style/noNonNullAssertion: ignore test files */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRsbuild,
  type RsbuildConfig,
  type RsbuildPlugin,
  type Rspack,
} from '@rsbuild/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  getI18nextExtractorWebpackPluginHooks,
  pluginI18nextExtractor,
  type AfterExtractPayload,
  type RenderExtractedTranslationsPayload,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixture');

describe('rsbuild-plugin-i18next-extractor', () => {
  const distDir = path.join(fixtureDir, 'dist');

  beforeAll(async () => {
    // Clean up previous build artifacts
    await fs.rm(distDir, { recursive: true, force: true });
  });

  const rsbuildConfig: RsbuildConfig = {
    source: {
      entry: {
        index: './src/index',
      },
    },
    output: {
      target: 'node',
      minify: false,
      distPath: {
        root: distDir,
      },
      filename: {
        js: '[name].cjs',
      },
    },
    plugins: [
      pluginI18nextExtractor({
        localesDir: './locales',
      }),
    ],
  };

  function createHookObserverPlugin(options: {
    onAfterExtract?: (payload: AfterExtractPayload) => AfterExtractPayload | void;
    onRenderExtractedTranslations?: (
      payload: RenderExtractedTranslationsPayload,
    ) => RenderExtractedTranslationsPayload | void;
  }): RsbuildPlugin {
    return {
      name: 'test:i18next-extractor-hook-observer',
      setup(api) {
        api.modifyBundlerChain((chain) => {
          chain
            .plugin('test:i18next-extractor-hook-observer')
            .use(
              class HookObserverPlugin {
                apply(compiler: Rspack.Compiler) {
                  compiler.hooks.compilation.tap(
                    'test:i18next-extractor-hook-observer',
                    (compilation) => {
                      const hooks =
                        getI18nextExtractorWebpackPluginHooks(compilation);

                      if (options.onAfterExtract) {
                        hooks.afterExtract.tapPromise(
                          'test:i18next-extractor-hook-observer',
                          async (payload) =>
                            options.onAfterExtract?.(payload) ?? payload,
                        );
                      }

                      if (options.onRenderExtractedTranslations) {
                        hooks.renderExtractedTranslations.tapPromise(
                          'test:i18next-extractor-hook-observer',
                          async (payload) =>
                            options.onRenderExtractedTranslations?.(payload) ??
                            payload,
                        );
                      }
                    },
                  );
                }
              },
            );
        });
      },
    };
  }

  it('should extract only used i18n keys after build', async () => {
    // Create rsbuild instance with the fixture config
    const rsbuild = await createRsbuild({
      cwd: fixtureDir,
      rsbuildConfig,
    });

    // Run the build
    await rsbuild.build();

    // Check if the build output exists
    const distIndexPath = path.join(distDir, 'index.cjs');
    const distIndexExists = await fs
      .access(distIndexPath)
      .then(() => true)
      .catch(() => false);
    expect(distIndexExists).toBe(true);

    // Read the output file
    const distContent = await fs.readFile(distIndexPath, 'utf-8');

    // Verify the output contains the extracted translations
    expect(distContent).toBeTruthy();
    expect(distContent.length).toBeGreaterThan(0);

    // Check that English translations variable is defined
    expect(distContent).toContain('__I18N_EN_EXTRACTED_TRANSLATIONS__');

    // Check that Chinese translations variable is defined
    expect(distContent).toContain('__I18N_ZH_CN_EXTRACTED_TRANSLATIONS__');

    // Extract and parse the English translations
    const enTranslationsMatch = distContent.match(
      /const __I18N_EN_EXTRACTED_TRANSLATIONS__ = ({.*?});/s,
    );
    expect(enTranslationsMatch).toBeTruthy();
    const enTranslations = JSON.parse(enTranslationsMatch?.[1] || '{}');

    // Extract and parse the Chinese translations
    const zhTranslationsMatch = distContent.match(
      /const __I18N_ZH_CN_EXTRACTED_TRANSLATIONS__ = ({.*?});/s,
    );
    expect(zhTranslationsMatch).toBeTruthy();
    const zhTranslations = JSON.parse(zhTranslationsMatch![1]);

    // Verify English translations contain only used keys
    expect(enTranslations).toHaveProperty('title');
    expect(enTranslations.title).toBe('Welcome to i18next-extractor');

    expect(enTranslations).toHaveProperty('look');
    expect(enTranslations.look).toEqual({ deep: 'Look deep' });

    expect(enTranslations).toHaveProperty('interpolation');
    expect(enTranslations.interpolation).toBe('{{what}} is {{how}}');

    expect(enTranslations).toHaveProperty('key_one');
    expect(enTranslations.key_one).toBe('item');

    expect(enTranslations).toHaveProperty('key_other');
    expect(enTranslations.key_other).toBe('items');

    // Verify unused keys are NOT included
    expect(enTranslations).not.toHaveProperty('unused');

    // Verify Chinese translations contain only used keys
    expect(zhTranslations).toHaveProperty('title');
    expect(zhTranslations.title).toBe('欢迎使用 i18next-extractor');

    expect(zhTranslations).toHaveProperty('look');
    expect(zhTranslations.look).toEqual({ deep: '深入查找' });

    expect(zhTranslations).toHaveProperty('interpolation');
    expect(zhTranslations.interpolation).toBe('{{what}} 是 {{how}}');

    expect(zhTranslations).toHaveProperty('key_other');
    expect(zhTranslations.key_other).toBe('个');

    // Verify unused keys are NOT included
    expect(zhTranslations).not.toHaveProperty('unused');
  });

  it('should expose extracted translations through afterExtract hook', async () => {
    let capturedPayload: AfterExtractPayload | undefined;

    const rsbuild = await createRsbuild({
      cwd: fixtureDir,
      rsbuildConfig: {
        ...rsbuildConfig,
        output: {
          ...rsbuildConfig.output,
          distPath: {
            root: path.join(fixtureDir, 'dist-after-extract'),
          },
        },
        plugins: [
          pluginI18nextExtractor({
            localesDir: './locales',
          }),
          createHookObserverPlugin({
            onAfterExtract(payload) {
              capturedPayload = payload;
            },
          }),
        ],
      },
    });

    await rsbuild.build();

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload?.entryName).toBe('index');
    expect(capturedPayload?.locales).toEqual(['en', 'zh-CN']);
    expect(capturedPayload?.files.length).toBeGreaterThan(0);
    expect(capturedPayload?.extractedKeysByLocale.en).toContain('title');
    expect(capturedPayload?.extractedKeysByLocale['zh-CN']).toContain('title');
    expect(capturedPayload?.extractedTranslationsByLocale.en.title).toBe(
      'Welcome to i18next-extractor',
    );
    expect(capturedPayload?.extractedTranslationsByLocale['zh-CN'].title).toBe(
      '欢迎使用 i18next-extractor',
    );
  });

  it('should allow renderExtractedTranslations hook to customize or skip asset injection', async () => {
    const customDistDir = path.join(fixtureDir, 'dist-render-hook');

    const rsbuild = await createRsbuild({
      cwd: fixtureDir,
      rsbuildConfig: {
        ...rsbuildConfig,
        output: {
          ...rsbuildConfig.output,
          distPath: {
            root: customDistDir,
          },
        },
        plugins: [
          pluginI18nextExtractor({
            localesDir: './locales',
          }),
          createHookObserverPlugin({
            onRenderExtractedTranslations(payload) {
              if (payload.locale === 'en') {
                return {
                  ...payload,
                  code: `const ${payload.variableName} = { "custom": "english-only" };`,
                };
              }

              if (payload.locale === 'zh-CN') {
                return {
                  ...payload,
                  skip: true,
                  code: '',
                };
              }

              return payload;
            },
          }),
        ],
      },
    });

    await rsbuild.build();

    const distContent = await fs.readFile(
      path.join(customDistDir, 'index.cjs'),
      'utf-8',
    );

    expect(distContent).toContain(
      'const __I18N_EN_EXTRACTED_TRANSLATIONS__ = { "custom": "english-only" };',
    );
    expect(distContent).not.toContain(
      'const __I18N_ZH_CN_EXTRACTED_TRANSLATIONS__ =',
    );
  });
});
