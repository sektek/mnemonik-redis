# CLAUDE.md — @sektek/mnemonik-redis

Redis-backed `Store<T, K>` implementation for use with `@sektek/mnemonik`. Provides `RedisStore` with pluggable key/value serialization and async iterators for key and value scanning.

## Commands

```bash
npm run build        # Compile (tsc -p tsconfig.build.json)
npm test             # Run all tests (mocha + tsx/esm)
npm run test:cover   # Coverage via c8

# Single test file:
npx mocha --import tsx/esm src/path/to/file.spec.ts
```

## Source layout

```
src/
  types/
    serializer.ts       # SerializerFn, Serializer, SerializerComponent
    deserializer.ts     # DeserializerFn, Deserializer, DeserializerComponent
  redis-store.ts        # RedisStore<T, K, KS, VS>
  redis-key-iterator.ts # RedisKeyIterator<K> — async iterable over keys
  redis-value-iterator.ts # RedisValueIterator<T> — async iterable over values
  *.spec.ts             # Tests co-located with source
```

## Classes

### `RedisStore<T, K = string, KS extends RedisKey = string, VS extends RedisValue = string>`

Implements `Store<T, K>` from utility-belt using ioredis.

**Constructor options (`RedisStoreOptions`):**

| Option | Default | Purpose |
|--------|---------|---------|
| `redis` | required | ioredis `Redis` client |
| `prefix` | `''` | Prepended to all Redis keys |
| `keySerializer` | identity | Serializes `K` → `KS` via `.serialize` |
| `keyDeserializer` | identity | Deserializes `KS` → `K` via `.deserialize` |
| `valueSerializer` | `JSON.stringify` | Serializes `T` → `VS` via `.serialize` |
| `valueDeserializer` | `JSON.parse` | Deserializes `VS` → `T` via `.deserialize` |
| `keyIteratorBufferSize` | — | SCAN batch size for `keys()` |
| `valueIteratorBufferSize` | — | SCAN batch size for `values()` |
| `iteratorBufferSize` | — | Fallback buffer size for both iterators |

All serializer/deserializer options accept either a plain function or a component object (resolved via utility-belt `getComponent`).

**Methods:**

| Method | Redis command(s) | Notes |
|--------|-----------------|-------|
| `get(key)` | `GET` | Returns `undefined` if key absent |
| `set(key, value)` | `SET` | — |
| `delete(key)` | `DEL` | Returns `true` if key existed |
| `has(key)` | `EXISTS` | — |
| `keys()` | `SCAN` | Returns `RedisKeyIterator<K>` |
| `values()` | `SCAN` + `MGET` | Returns `RedisValueIterator<T>` |
| `clear()` | `KEYS` + `DEL` | Uses `KEYS pattern*` — avoid on large keyspaces in production |

All key operations apply the prefix via an internal `#applyPrefix()` helper before the Redis call.

---

### `RedisKeyIterator<K>`

Async iterator over all keys in the store. Uses Redis `SCAN` in batches.

**Options:** `redis`, `prefix`, `keyDeserializer`, `bufferSize?`

**Behaviour:**
- Scans with pattern `${prefix}*` (or `*` if no prefix)
- Deserializes all keys in each batch concurrently via `Promise.all`
- Yields one key at a time; refills buffer automatically when exhausted

---

### `RedisValueIterator<T>`

Async iterator over all values in the store. Uses Redis `SCAN` + `MGET`.

**Options:** `redis`, `prefix`, `valueDeserializer`, `bufferSize?`

**Behaviour:**
- Scans keys with pattern `${prefix}*` per batch
- Fetches all values in the batch with a single `MGET`
- Filters out `null` results, then deserializes concurrently via `Promise.all`
- Yields one value at a time

---

## Types (`src/types/`)

| Type | Description |
|------|-------------|
| `SerializerFn<T, O>` | `(value: T) => O \| PromiseLike<O>` |
| `Serializer<T, O>` | Object with `.serialize` method |
| `SerializerComponent<T, O>` | `Component<Serializer<T, O>, 'serialize'>` |
| `DeserializerFn<T, I>` | `(value: I) => T \| PromiseLike<T>` |
| `Deserializer<T, I>` | Object with `.deserialize` method |
| `DeserializerComponent<T, I>` | `Component<Deserializer<T, I>, 'deserialize'>` |

Default `O`/`I` is `RedisValue` (ioredis type). All serializers/deserializers support sync or async return values.

## Testing

Tests run against a **real Redis instance** — there is no mock of ioredis.

```bash
# Connection defaults:
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Patterns:**
- Each test suite generates a unique `randomUUID()` prefix to isolate keys
- `afterEach` calls `store.clear()` to clean up
- No Sinon used — tests assert via direct `get`/`has` calls and Chai `expect`
- `chai-as-promised` for async assertions

## Key constraints

- No new dependencies without explicit approval
- ESM only; imports use `.js` extensions
- Depends on `@sektek/utility-belt` (`Store`, `getComponent`, `Component`)
- Does not emit any events — it is a pure data layer; events belong to `CacheStore` in `@sektek/mnemonik`
- `clear()` uses Redis `KEYS` command: acceptable for moderate keyspaces but avoid on very large datasets
