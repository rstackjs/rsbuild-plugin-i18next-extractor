# Changelog

## 0.2.1

### Bug Fixes

- Initialize and reuse compilation hooks earlier so integrations can reliably tap `afterExtract` and `renderExtractedTranslations` during the `compilation` phase.
- support Rsbuild v2

## 0.2.0

### Breaking Changes

- `i18next-cli` is now a peer dependency instead of a bundled dependency. Install `i18next-cli` in your app alongside `rsbuild-plugin-i18next-extractor`.

### Features

- Add public compilation hooks:
  - `afterExtract` for consuming extracted translations after key extraction
  - `renderExtractedTranslations` for customizing or skipping JS asset injection
- Export `getI18nextExtractorWebpackPluginHooks`, `AfterExtractPayload`, and `RenderExtractedTranslationsPayload` for plugin consumers

## 0.1.4

### Features

- Add debug mode support via `DEBUG` environment variable to output extraction details to `node_modules/.rsbuild-plugin-i18next-extractor/`.

## 0.1.3

### Bug Fixes

- Fix `TypeError: extractedKeys is not iterable` when all files of an entry are filtered out by the `ignore` option in multi-entry builds.

## 0.1.2

### Features

- Add `extract.ignore` option to exclude files from translation extraction.

## 0.1.1

### Bug Fixes

- Update README links and documentation.

## 0.1.0

### Features

- Initial release.
- Automatically extract used i18n translation keys from source code.
- Only include used translations in the output bundle to reduce bundle size.
- Support for nested keys, interpolation, and pluralization.
- `onKeyNotFound` callback for handling missing translation keys.
