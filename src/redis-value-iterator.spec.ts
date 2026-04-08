import { randomUUID } from 'crypto';

import { expect } from 'chai';

import { Redis, RedisKey, RedisValue } from 'ioredis';

import { RedisValueIterator } from './redis-value-iterator.js';

const host = process.env.REDIS_HOST || 'localhost';
const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

describe('RedisValueIterator', function () {
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

  it('should iterate over values with the given prefix', async function () {
    const keyValuesToSet: Array<{ key: RedisKey; value: RedisValue }> = [
      { key: `${prefix}key1`, value: '"value1"' },
      { key: `${prefix}key2`, value: '"value2"' },
      { key: `${prefix}key3`, value: '"value3"' },
    ];
    await Promise.all(
      keyValuesToSet.map(({ key, value }) => {
        redis.set(key, value);
        keysToCleanup.push(key);
      }),
    );

    const iterator = new RedisValueIterator<string>({
      redis,
      prefix,
      valueDeserializer: {
        deserialize: async (value: RedisValue) => JSON.parse(value),
      },
      bufferSize: 2,
    });

    const retrievedValues: string[] = [];
    for await (const value of iterator) {
      retrievedValues.push(value);
    }

    expect(retrievedValues).to.have.members(['value1', 'value2', 'value3']);
  });

  it('should handle empty keyspace gracefully', async function () {
    const iterator = new RedisValueIterator<string>({
      redis,
      prefix: `${prefix}nonexistent:`,
      valueDeserializer: {
        deserialize: async (value: RedisValue) => JSON.parse(value),
      },
    });

    const retrievedValues: string[] = [];
    for await (const value of iterator) {
      retrievedValues.push(value);
    }

    expect(retrievedValues).to.be.empty;
  });

  it('should allow custom deserializer', async function () {
    const keyValuesToSet: Array<{ key: RedisKey; value: RedisValue }> = [
      { key: `${prefix}key1`, value: '42' },
      { key: `${prefix}key2`, value: '43' },
    ];
    await Promise.all(
      keyValuesToSet.map(({ key, value }) => {
        redis.set(key, value);
        keysToCleanup.push(key);
      }),
    );

    const iterator = new RedisValueIterator<number>({
      redis,
      prefix,
      valueDeserializer: {
        deserialize: Number,
      },
    });

    const retrievedValues: number[] = [];
    for await (const value of iterator) {
      retrievedValues.push(value);
    }

    expect(retrievedValues).to.have.members([42, 43]);
  });
});
