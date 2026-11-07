# Changelog

## [0.2.0](https://github.com/sektek/mnemonik-redis/compare/v0.1.1...v0.2.0) (2026-11-07)

### ⚠ BREAKING CHANGES

* **mnemonik-redis:** keys() now yields keys without the configured prefix, so they can be passed back to get/has/delete. Callers that strip the prefix themselves must stop doing so.

* test(mnemonik-redis): drop redundant cleanup

### Bug Fixes

* **mnemonik-redis:** keys() should yield keys without the prefix ([#4](https://github.com/sektek/mnemonik-redis/issues/4)) ([ec4593c](https://github.com/sektek/mnemonik-redis/commit/ec4593cc443328d204d535c2935edbc5e40b6725))

## 0.1.1 (2026-04-08)

### Features

* add deserializer and serializer types ([581140d](https://github.com/sektek/mnemonik-redis/commit/581140d318979bae680b24c5ea08ab321c323e8b))
* implement Redis store and iterators with customizable serialization ([7eed3e5](https://github.com/sektek/mnemonik-redis/commit/7eed3e5175f6f82a719075a6dc6bc60f0bc26160))
