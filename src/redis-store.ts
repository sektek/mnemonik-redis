import { Redis, RedisKey } from 'ioredis';
import { getComponent } from '@sektek/utility-belt';

import {
  DeserializerComponent,
  DeserializerFn,
  SerializerComponent,
  SerializerFn,
} from './types/index.js';

type RedisStoreOptions<T, K = RedisKey> = {
  redis: Redis;
  prefix?: string;
  keyDeserializer?: DeserializerComponent<K, RedisKey>;
  keySerializer?: SerializerComponent<K, RedisKey>;
  valueDeserializer?: DeserializerComponent<T>;
  valueSerializer?: SerializerComponent<T>;
};

// Simple passthrough functions that can work with any type
function createPassthroughKeySerializer<K>(): SerializerFn<K, RedisKey> {
  return (key: K): RedisKey => String(key) as RedisKey;
}

export class RedisStore<T, K = string> {
  #redis: Redis;
  #prefix: string;
  #keySerializer: SerializerFn<K, RedisKey>;
  #valueSerializer: SerializerFn<T>;
  #valueDeserializer: DeserializerFn<T>;

  constructor(opts: RedisStoreOptions<T, K>) {
    this.#redis = opts.redis;
    this.#prefix = opts.prefix || '';
    this.#keySerializer = getComponent(opts.keySerializer, 'serialize', {
      defaultProvider: createPassthroughKeySerializer<K>,
    });

    this.#valueSerializer = getComponent(opts.valueSerializer, 'serialize', {
      default: JSON.stringify,
    });
    this.#valueDeserializer = getComponent(
      opts.valueDeserializer,
      'deserialize',
      {
        default: JSON.parse,
      },
    );
  }

  async get(key: K): Promise<T | undefined> {
    const serializedKey = this.#applyPrefix(await this.#keySerializer(key));
    const value = await this.#redis.get(serializedKey);
    if (value === null) {
      return undefined;
    }
    return await this.#valueDeserializer(value);
  }

  async set(key: K, value: T): Promise<void> {
    const serializedKey = this.#applyPrefix(await this.#keySerializer(key));
    const serializedValue = await this.#valueSerializer(value);
    await this.#redis.set(serializedKey, serializedValue);
  }

  async delete(key: K): Promise<boolean> {
    const serializedKey = this.#applyPrefix(await this.#keySerializer(key));
    const result = await this.#redis.del(serializedKey);
    return result > 0;
  }

  async has(key: K): Promise<boolean> {
    const serializedKey = this.#applyPrefix(await this.#keySerializer(key));
    const result = await this.#redis.exists(serializedKey);
    return result > 0;
  }

  async clear(): Promise<void> {
    // If prefix is specified, only delete keys with that prefix
    const pattern = this.#prefix ? `${this.#prefix}*` : '*';
    const keys = await this.#redis.keys(pattern);
    if (keys.length > 0) {
      await this.#redis.del(...keys);
    }
  }

  #applyPrefix(key: RedisKey): RedisKey {
    return this.#prefix ? `${this.#prefix}${key}` : key;
  }
}
