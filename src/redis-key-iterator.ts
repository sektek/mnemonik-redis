import { Redis, RedisKey } from 'ioredis';
import { getComponent } from '@sektek/utility-belt';

import { DeserializerComponent, DeserializerFn } from './types/index.js';

export type RedisKeyIteratorOptions<K = RedisKey> = {
  redis: Redis;
  prefix: string;
  keyDeserializer: DeserializerComponent<K, RedisKey>;
  bufferSize?: number;
};

export class RedisKeyIterator<K = RedisKey> {
  #redis: Redis;
  #prefix: string;
  #keyDeserializer: DeserializerFn<K, RedisKey>;
  #cursor: string;
  #buffer: K[];
  #bufferSize: number;
  #isComplete: boolean;

  constructor(opts: RedisKeyIteratorOptions<K>) {
    this.#redis = opts.redis;
    this.#prefix = opts.prefix;
    this.#keyDeserializer = getComponent(opts.keyDeserializer, 'deserialize', {
      default: (key: RedisKey) => key as K,
    });
    this.#cursor = '0';
    this.#buffer = [];
    this.#bufferSize = opts.bufferSize || 100;
    this.#isComplete = false;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<K> {
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
        this.#buffer.push(
          ...(await Promise.all(keys.map(key => this.#keyDeserializer(key)))),
        );
      }

      if (this.#buffer.length > 0) {
        yield this.#buffer.shift() as K;
      }
    }
  }
}
