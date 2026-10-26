# Mnemonik Redis

Redis adapter for Mnemonik. It provides `RedisStore`, a `Store<T, K>` from `@sektek/utility-belt` backed by Redis through [ioredis](https://github.com/redis/ioredis), with pluggable key and value serialization.

Because it implements the same `Store` interface as a `Map`, it can be used anywhere a store is accepted, for example as the `store` or `cache` of `CacheStore` and `FallbackCacheStore` from `@sektek/mnemonik`.

## Installation

```sh
npm install @sektek/mnemonik-redis
```

You need a reachable Redis server. The store does not create or close the connection; you pass in an ioredis client and manage its lifecycle.

## Usage

```ts
import { Redis } from 'ioredis';
import { RedisStore } from '@sektek/mnemonik-redis';

const redis = new Redis({ host: 'localhost', port: 6379 });

type User = { name: string; email: string };

const users = new RedisStore<User>({ redis, prefix: 'users:' });

await users.set('u1', { name: 'Ada', email: 'ada@example.com' });

await users.get('u1'); // { name: 'Ada', email: 'ada@example.com' }
await users.get('missing'); // undefined
await users.has('u1'); // true
await users.delete('u1'); // true (false if the key did not exist)
```

Values are stored as JSON strings by default and parsed on the way back.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `redis` | required | An ioredis `Redis` client. |
| `prefix` | `''` | Prepended verbatim to every Redis key. Include your own separator, e.g. `'users:'`. |
| `valueSerializer` | `JSON.stringify` | Converts a value to what is stored in Redis. |
| `valueDeserializer` | `JSON.parse` | Converts the stored string back to a value. |
| `keySerializer` | identity | Converts a key of type `K` to a Redis key. |
| `keyDeserializer` | identity | Converts a Redis key back to `K`. Used by `keys()`. |
| `keyIteratorBufferSize` | `100` | `COUNT` hint for each `SCAN` batch in `keys()`. |
| `valueIteratorBufferSize` | `100` | `COUNT` hint for each `SCAN` batch in `values()`. |
| `iteratorBufferSize` | | Sets both iterator sizes unless a more specific one is given. |

## Methods

| Method | Redis command | Notes |
|--------|---------------|-------|
| `get(key)` | `GET` | Resolves to `undefined` when the key does not exist. |
| `set(key, value)` | `SET` | Overwrites any existing value. There is no TTL option. |
| `delete(key)` | `DEL` | Resolves to `true` if a key was removed. |
| `has(key)` | `EXISTS` | |
| `keys()` | `SCAN` | Returns an `AsyncIterable<K>`. |
| `values()` | `SCAN` + `MGET` | Returns an `AsyncIterable<T>`. |
| `clear()` | `KEYS` + `DEL` | Deletes every key matching the prefix. See the warning below. |

> **`clear()` without a prefix deletes everything.** With no `prefix` the pattern is `*`, so `clear()` removes every key in the Redis database, not only the ones this store wrote. Always set a `prefix` unless the store owns the whole database. `clear()` also uses `KEYS`, which blocks Redis while it scans, so avoid it on large keyspaces in production.

## Iterating keys and values

`keys()` and `values()` use `SCAN`, so they stream through the keyspace in batches without blocking Redis.

```ts
for await (const user of users.values()) {
  console.log(user.name);
}

for await (const key of users.keys()) {
  console.log(key);
}
```

Things to be aware of:

- **Keys include the prefix.** `keys()` yields the key as it is stored in Redis, prefix included (`'users:u1'`, not `'u1'`). Passing it straight back to `get()` would prefix it a second time, so strip the prefix yourself or use a `keyDeserializer` that does.
- **Each iterable can be consumed once.** The iterator holds its own cursor; call `keys()` or `values()` again to start another pass.
- **`SCAN` guarantees are weak.** A key can occasionally be returned more than once, and keys added or removed during the iteration may or may not appear.
- `values()` skips keys that disappear between the `SCAN` and the `MGET`.

## Custom serialization

Each serializer and deserializer can be a plain function or an object with the matching method (`serialize` / `deserialize`).

Store values with a different encoding:

```ts
import { RedisStore } from '@sektek/mnemonik-redis';

const store = new RedisStore<Date>({
  redis,
  prefix: 'last-seen:',
  valueSerializer: date => date.toISOString(),
  valueDeserializer: text => new Date(text),
});
```

Use a non-string key type:

```ts
type OrderId = { tenant: string; id: number };

const orders = new RedisStore<Order, OrderId>({
  redis,
  prefix: 'orders:',
  keySerializer: key => `${key.tenant}/${key.id}`,
  keyDeserializer: text => {
    const [tenant, id] = String(text).replace('orders:', '').split('/');
    return { tenant, id: Number(id) };
  },
});
```

Serializers and deserializers may be asynchronous. The class takes four type arguments, `RedisStore<T, K, KS, VS>`: the value and key types, and the types they serialize to in Redis (`string` by default). Only change `KS` and `VS` if your serializers produce something other than a string, such as a `Buffer`.

## Using it as a cache layer

```ts
import { CacheStore } from '@sektek/mnemonik';
import { RedisStore } from '@sektek/mnemonik-redis';

const cache = new CacheStore<User>({
  store: userDatabaseStore,
  cache: new RedisStore<User>({ redis, prefix: 'cache:users:' }),
});
```

## Types

`SerializerFn`, `Serializer`, `SerializerComponent`, `DeserializerFn`, `Deserializer`, `DeserializerComponent`, and `RedisStoreOptions` are exported from the package root.
