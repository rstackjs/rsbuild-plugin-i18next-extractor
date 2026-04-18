# rsbuild-plugin-i18next-extractor

<p>
  <a href="https://npmjs.com/package/rsbuild-plugin-i18next-extractor">
   <img src="https://img.shields.io/npm/v/rsbuild-plugin-i18next-extractor?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" />
  </a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" />
  <a href="https://npmcharts.com/compare/rsbuild-plugin-i18next-extractor?minimal=true"><img src="https://img.shields.io/npm/dm/rsbuild-plugin-i18next-extractor.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
</p>

A Rsbuild plugin for extracting i18n translations using [i18next-cli](https://github.com/i18next/i18next-cli). 

## Why

`i18next-cli` can extract i18n translations from your source code through [`extract.input`](https://github.com/i18next/i18next-cli?tab=readme-ov-file#1-initialize-configuration). However some i18n translations will be bundled together with your code even if they are not used.

This plugin uses the Rspack module graph to override the `extract.input` configuration with imported modules, generating i18n translations based on usage.

## Installation

```bash
npm add rsbuild-plugin-i18next-extractor --save-dev
```

## Usage

### Install

```ts
// rsbuild.config.ts
import { pluginI18nextExtractor } from 'rsbuild-plugin-i18next-extractor';
import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  plugins: [
    pluginI18nextExtractor({
      localesDir: './locales',
    }),
  ],
});
```

### Directory Structure

Your project should have a locales directory with JSON files:

```
locales/
  en.json
  zh.json
  ja.json
```

**NOTE:** `rsbuild-plugin-i18next-extractor` only supports `*.json` files.


### Using i18n in your code

```js
// ./src/i18n.js
import i18next from 'i18next';
import en from '../locales/en.json';
import zh from '../locales/zh.json';

const i18n = i18next.createInstance()

i18n.init({
  lng: 'en',
  resources: {
    en: {
      translation: en,
    },
    zh: {
      translation: zh,
    }
  }
})

export { i18n }
```

use `i18n.t('key')` to translate

```js
// src/index.js
import { i18n } from './i18n';

console.log(i18n.t('hello'));
```

## Hooks

`rsbuild-plugin-i18next-extractor` now exposes compilation hooks so other build-time plugins can consume extracted translations or customize how the extracted payload is written back to JS assets.

Exported APIs:

- `getI18nextExtractorWebpackPluginHooks(compilation)`
- `I18nextExtractorWebpackPluginHooks`
- `AfterExtractPayload`
- `RenderExtractedTranslationsPayload`

### `afterExtract`

Called after translation keys have been extracted and locale payloads have been assembled for an entry.

This hook is useful when you want to:

- store extracted translations for a later build step
- inspect extracted keys for debugging or reporting
- feed extracted translations into another plugin

Payload shape:

```ts
type ExtractedTranslationValue = string | ExtractedTranslationsObject;

type ExtractedTranslationsObject = {
  [key: string]: ExtractedTranslationValue;
};

type AfterExtractPayload = {
  entryName: string;
  locales: string[];
  files: string[];
  extractedKeysByLocale: Record<string, string[]>;
  extractedTranslationsByLocale: Record<string, ExtractedTranslationsObject>;
};
```

### `renderExtractedTranslations`

Called before extracted translations are prepended back into JS assets.

The default behavior is still:

```ts
const __I18N_EN_EXTRACTED_TRANSLATIONS__ = { ... };
```

This hook is useful when you want to:

- customize the injected JS code
- skip JS injection for some or all locales
- redirect the extracted payload to another artifact pipeline

Payload shape:

```ts
type RenderExtractedTranslationsPayload = {
  entryName: string;
  locale: string;
  variableName: string;
  extractedKeys: string[];
  extractedTranslations: Record<string, string>;
  targetAssetNames: string[];
  code: string;
  skip?: boolean;
};
```

### Hook Example

```ts
import {
  defineConfig,
  type RsbuildPlugin,
  type Rspack,
} from '@rsbuild/core';
import {
  getI18nextExtractorWebpackPluginHooks,
  pluginI18nextExtractor,
} from 'rsbuild-plugin-i18next-extractor';

function pluginObserveI18nExtraction(): RsbuildPlugin {
  return {
    name: 'example:observe-i18n-extraction',
    setup(api) {
      api.modifyBundlerChain((chain) => {
        chain
          .plugin('example:observe-i18n-extraction')
          .use(
            class ObserveI18nExtractionPlugin {
              apply(compiler: Rspack.Compiler) {
                compiler.hooks.compilation.tap(
                  'example:observe-i18n-extraction',
                  (compilation) => {
                    const hooks =
                      getI18nextExtractorWebpackPluginHooks(compilation);

                    hooks.afterExtract.tapPromise(
                      'example:observe-i18n-extraction',
                      async (payload) => {
                        console.log(payload.entryName);
                        console.log(payload.extractedTranslationsByLocale);
                        return payload;
                      },
                    );

                    hooks.renderExtractedTranslations.tapPromise(
                      'example:observe-i18n-extraction',
                      async (payload) => {
                        if (payload.locale === 'zh-CN') {
                          return {
                            ...payload,
                            skip: true,
                            code: '',
                          };
                        }

                        return payload;
                      },
                    );
                  },
                );
              }
            },
          );
      });
    },
  };
}

export default defineConfig({
  plugins: [
    pluginI18nextExtractor({
      localesDir: './locales',
    }),
    pluginObserveI18nExtraction(),
  ],
});
```

### Hook Semantics

- `afterExtract` is a waterfall hook and should return the payload it wants later consumers to receive.
- `renderExtractedTranslations` is also a waterfall hook and should return the payload it wants the default emitter to use.
- Setting `skip: true` or returning an empty `code` string prevents that locale payload from being injected into JS assets.
- `targetAssetNames` contains all synchronous and async JS assets that would otherwise receive the injected definitions for the current entry.

## Options

### `localesDir`

- **Type:** `string`
- **Required:** Yes

The directory containing your locale JSON files.

Supports both relative and absolute paths:
- Relative path: Resolved relative to the project root directory (e.g., `'./locales'`, `'src/locales'`)
- Absolute path: Used as-is (e.g., `'/absolute/path/to/locales'`)

```ts
pluginI18nextExtractor({
  localesDir: './locales',
});
```

### `i18nextToolkitConfig`

- **Type:** `I18nextToolkitConfig`
- **Required:** No

The configuration for i18next-cli toolkit. This allows you to customize how translation keys are extracted from your code.

See [i18next-cli configuration](https://github.com/i18next/i18next-cli) for available options.

```ts
pluginI18nextExtractor({
  localesDir: './locales',
  i18nextToolkitConfig: {
    extract: {
      // Custom extraction configuration
    },
  },
});
```

#### Ignoring Files

- **Type:** `string | string[] | undefined`
- **Required:** No


You can use the `extract.ignore` option to exclude certain files from translation extraction. This is useful for avoiding extraction from third-party code, or other files that shouldn't be scanned for translations.

The `i18nextToolkitConfig.extract.ignore` option supports **glob patterns** and can be either a string or an array of strings:

**NOTE:** Unlike [i18next-cli](https://github.com/i18next/i18next-cli/blob/6c25f7a20febccf73cf20e22a927e7b1745a71a9/src/extractor/core/key-finder.ts#L130) which ignores `node_modules` by default, `rsbuild-plugin-i18next-extractor` scans all files including `node_modules` to ensure translations from third-party packages are properly extracted. If you want to exclude `node_modules`, use the `extract.ignore` option shown in the examples below. 

```ts
pluginI18nextExtractor({
  localesDir: './locales',
  i18nextToolkitConfig: {
    extract: {
      // Ignore a single pattern
      ignore: 'node_modules/**',
    },
  },
});
```

```ts
pluginI18nextExtractor({
  localesDir: './locales',
  i18nextToolkitConfig: {
    extract: {
      // Ignore multiple patterns
      ignore: [
        'node_modules/dayjs/**',
        'packages/**',
      ],
    },
  },
});
```

### `onKeyNotFound`

- **Type:** `(key: string, locale: string, localeFilePath: string, entryName: string) => void`
- **Required:** No

Custom callback function invoked when a translation key is not found in the locale file.

By default, a warning is logged to the console with the missing key and file information.

**Parameters:**
- `key` - The translation key that was not found
- `locale` - The locale identifier (e.g., `'en'`, `'zh-CN'`)
- `localeFilePath` - The path to the locale file
- `entryName` - The name of the current entry being processed

```ts
pluginI18nextExtractor({
  localesDir: './locales',
  onKeyNotFound: (key, locale, localeFilePath, entryName) => {
    console.error(`Missing key: ${key} in ${locale}`);
  },
});
```

## Credits

[rsbuild-plugin-tailwindcss](https://github.com/rspack-contrib/rsbuild-plugin-tailwindcss) - Inspiration for this plugin

## License

[MIT](./LICENSE)
