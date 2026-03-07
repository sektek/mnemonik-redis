import { Redis, RedisKey, RedisValue } from 'ioredis';
import { Store, getComponent } from '@sektek/utility-belt';

import {
  DeserializerComponent,
  DeserializerFn,
  SerializerComponent,
  SerializerFn,
} from './types/index.js';

import { RedisKeyIterator } from './redis-key-iterator.js';
import { RedisValueIterator } from './redis-value-iterator.js';

/**
 * Options for configuring the RedisStore.
 *
 * @template T The type of values stored.
 * @template K The type of keys used. Defaults to string.
 * @template KS The serialized type of keys in Redis. Defaults to string.
 * @template VS The serialized type of values in Redis. Defaults to string.
 */
export type RedisStoreOptions<
  T,
  K = string,
  KS extends RedisKey = string,
  VS extends RedisValue = string,
> = {
  /** An instance of ioredis Redis client. */
  redis: Redis;

  /** An optional prefix to prepend to all keys stored in Redis. */
  prefix?: string;

  /**
   * Optional deserializer for keys. If not provided, keys will be treated
   * as strings.
   */
  keyDeserializer?: DeserializerComponent<K, KS>;

  /**
   * Optional serializer for keys. If not provided, keys will be treated
   * as strings.
   */
  keySerializer?: SerializerComponent<K, KS>;

  /**
   * Optional deserializer for values. If not provided,
   * JSON.parse will be used.
   */
  valueDeserializer?: DeserializerComponent<T, string>;

  /**
   * Optional serializer for values. If not provided,
   * JSON.stringify will be used.
   */
  valueSerializer?: SerializerComponent<T, VS>;

  /** Optional buffer size for key iterator. */
  keyIteratorBufferSize?: number;

  /** Optional buffer size for value iterator. */
  valueIteratorBufferSize?: number;

  /** Optional buffer size for both key and value iterators. */
  iteratorBufferSize?: number;
};

// Simple passthrough functions that can work with any type
// function createPassthroughKeySerializer<K, KS extends RedisKey>(): SerializerFn<
//   K,
//   KS
// > {
//   return (key: K): KS => String(key) as KS;
// }

/**
 * A Redis-backed key-value store with customizable serialization.
 *
 * @template T The type of values stored.
 * @template K The type of keys used. Defaults to string.
 * @template KS The serialized type of keys in Redis. Defaults to string.
 * @template VS The serialized type of values in Redis. Defaults to string.
 */
export class RedisStore<
  T,
  K = string,
  KS extends RedisKey = string,
  VS extends RedisValue = string,
> implements Store<T, K> {
  #redis: Redis;
  #prefix: string;
  #keyDeserializer: DeserializerFn<K, KS>;
  #keySerializer: SerializerFn<K, KS>;
  #valueSerializer: SerializerFn<T, VS>;
  #valueDeserializer: DeserializerFn<T, string>;
  #keyIteratorBufferSize: undefined | number;
  #valueIteratorBufferSize: undefined | number;

  constructor(opts: RedisStoreOptions<T, K, KS, VS>) {
    this.#redis = opts.redis;
    this.#prefix = opts.prefix || '';
    this.#keyDeserializer = getComponent(opts.keyDeserializer, 'deserialize', {
      default: (key: RedisKey) => key as K,
    });
    this.#keySerializer = getComponent(opts.keySerializer, 'serialize', {
      default: (key: K) => key as unknown as KS,
    });

    this.#valueSerializer = getComponent(opts.valueSerializer, 'serialize', {
      default: (value: T) => JSON.stringify(value) as VS,
    });
    this.#valueDeserializer = getComponent(
      opts.valueDeserializer,
      'deserialize',
      {
        default: (value: string) => JSON.parse(value) as T,
      },
    );

    this.#keyIteratorBufferSize =
      opts.keyIteratorBufferSize ?? opts.iteratorBufferSize;
    this.#valueIteratorBufferSize =
      opts.valueIteratorBufferSize ?? opts.iteratorBufferSize;
  }

  keys(): AsyncIterable<K> {
    return new RedisKeyIterator<K>({
      redis: this.#redis,
      prefix: this.#prefix,
      keyDeserializer: this.#keyDeserializer,
      bufferSize: this.#keyIteratorBufferSize,
    });
  }

  values(): AsyncIterable<T> {
    return new RedisValueIterator<T>({
      redis: this.#redis,
      prefix: this.#prefix,
      valueDeserializer: this.#valueDeserializer,
      bufferSize: this.#valueIteratorBufferSize,
    });
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
