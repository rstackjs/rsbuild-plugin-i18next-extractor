# Changelog

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
