import { randomUUID } from 'crypto';

import { expect } from 'chai';

import { Redis, RedisKey } from 'ioredis';

import { RedisKeyIterator } from './redis-key-iterator.js';

const host = process.env.REDIS_HOST || 'localhost';
const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

describe('RedisKeyIterator', function () {
  let redis: Redis;
  let prefix: string;
  let keysToCleanup: RedisKey[] = [];

  before(function () {
    redis = new Redis({ host, port });
    prefix = `test:${randomUUID()}:`;
  });

  after(async function () {
    await redis.quit();
  });

  afterEach(async function () {
    if (keysToCleanup.length > 0) {
      await redis.del(...keysToCleanup);
      keysToCleanup = [];
    }
  });

  it('should iterate over keys with the given prefix', async function () {
    const keysToSet = ['key1', 'key2', 'key3'].map(key => `${prefix}${key}`);
    await Promise.all(
      keysToSet.map(key => {
        redis.set(key, 'value');
        keysToCleanup.push(key);
      }),
    );

    const iterator = new RedisKeyIterator<string>({
      redis,
      prefix,
      keyDeserializer: {
        deserialize: async (key: string) => key.replace(prefix, ''),
      },
      bufferSize: 2,
    });

    const retrievedKeys: string[] = [];
    for await (const key of iterator) {
      retrievedKeys.push(key);
    }

    expect(retrievedKeys).to.have.members(['key1', 'key2', 'key3']);
  });

  it('should handle empty keyspace gracefully', async function () {
    const iterator = new RedisKeyIterator<string>({
      redis,
      prefix: `${prefix}nonexistent:`,
      keyDeserializer: {
        deserialize: async (key: string) =>
          key.replace(`${prefix}nonexistent:`, ''),
      },
    });

    const retrievedKeys: string[] = [];
    for await (const key of iterator) {
      retrievedKeys.push(key);
    }

    expect(retrievedKeys).to.be.empty;
  });

  it('should allow custom key deserialization', async function () {
    const rawKey = `${prefix}customKey`;
    await redis.set(rawKey, 'value');
    keysToCleanup.push(rawKey);

    const iterator = new RedisKeyIterator<{ original: string; upper: string }>({
      redis,
      prefix,
      keyDeserializer: {
        deserialize: async (key: string) => ({
          original: key,
          upper: key.toUpperCase(),
        }),
      },
    });

    const retrievedKeys: Array<{ original: string; upper: string }> = [];
    for await (const keyObj of iterator) {
      retrievedKeys.push(keyObj);
    }

    expect(retrievedKeys).to.have.lengthOf(1);
    expect(retrievedKeys[0]).to.deep.equal({
      original: rawKey,
      upper: rawKey.toUpperCase(),
    });
  });
});
