import { Redis, RedisValue } from 'ioredis';
import { getComponent } from '@sektek/utility-belt';

import { DeserializerComponent, DeserializerFn } from './types/index.js';

/**
 * Options for configuring the RedisValueIterator.
 * @param redis An instance of ioredis Redis client.
 * @param prefix The prefix to filter keys in Redis.
 * @param valueDeserializer Deserializer for values.
 *  If not provided, JSON.parse will be used.
 * @param bufferSize Optional buffer size for scanning keys.
 */
export type RedisValueIteratorOptions<T> = {
  redis: Redis;
  prefix: string;
  valueDeserializer: DeserializerComponent<T, RedisValue>;
  bufferSize?: number;
};

/**
 * An async iterator that iterates over values in Redis with a given prefix.
 * It uses SCAN to efficiently retrieve keys and MGET to fetch their values.
 *
 * @param T The type of values being iterated over.
 */
export class RedisValueIterator<T> {
  #redis: Redis;
  #prefix: string;
  #valueDeserializer: DeserializerFn<T, RedisValue>;
  #cursor: string;
  #buffer: T[];
  #bufferSize: number;
  #isComplete: boolean;

  constructor(opts: RedisValueIteratorOptions<T>) {
    this.#redis = opts.redis;
    this.#prefix = opts.prefix;
    this.#valueDeserializer = getComponent(
      opts.valueDeserializer,
      'deserialize',
      {
        default: JSON.parse,
      },
    );
    this.#cursor = '0';
    this.#buffer = [];
    this.#bufferSize = opts.bufferSize || 100;
    this.#isComplete = false;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    while (!this.#isComplete || this.#buffer.length > 0) {
      if (this.#buffer.length === 0) {
        const [newCursor, keys] = await this.#redis.scan(
          this.#cursor,
          'MATCH',
          this.#prefix ? `${this.#prefix}*` : '*',
          'COUNT',
          this.#bufferSize,
        );
        this.#cursor = newCursor;
        this.#isComplete = this.#cursor === '0';
        if (keys.length > 0) {
          const values = await this.#redis.mget(...keys);
          this.#buffer.push(
            ...(await Promise.all(
              values
                .filter(value => value !== null)
                .map(value => this.#valueDeserializer(value)),
            )),
          );
        }
      }

      if (this.#buffer.length > 0) {
        yield this.#buffer.shift() as T;
      }
    }
  }
}
