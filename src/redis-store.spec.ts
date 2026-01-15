import { randomUUID } from 'crypto';

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { Redis } from 'ioredis';

import { RedisStore } from './redis-store.js';

use(chaiAsPromised);

const host = process.env.REDIS_HOST || 'localhost';
const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

describe('RedisStore', function () {
  let redis: Redis;
  let store: RedisStore<string, string>;
  let prefix: string;

  before(function () {
    redis = new Redis({ host, port });
    prefix = `test:${randomUUID()}:`;
  });

  beforeEach(function () {
    store = new RedisStore<string, string>({ redis, prefix });
  });

  afterEach(async function () {
    await store.clear();
  });

  it('should set a key within Redis', async function () {
    await store.set('key1', 'value1');
    const value = await redis.get(`${prefix}key1`);
    expect(value).to.equal('"value1"');
  });

  it('should get a key from Redis', async function () {
    await redis.set(`${prefix}key1`, '"value1"');
    const value = await store.get('key1');
    expect(value).to.equal('value1');
  });

  it('should return undefined for non-existent keys', async function () {
    const value = await store.get('nonexistent');
    expect(value).to.be.undefined;
  });

  it('should delete a key', async function () {
    await store.set('key1', 'value1');
    const deleted = await store.delete('key1');
    expect(deleted).to.be.true;
    const value = await store.get('key1');
    expect(value).to.be.undefined;
  });

  it('should return false when deleting a non-existent key', async function () {
    const deleted = await store.delete('nonexistent');
    expect(deleted).to.be.false;
  });

  it('should check existence of a key', async function () {
    await store.set('key1', 'value1');
    const exists = await store.has('key1');
    expect(exists).to.be.true;
  });

  it('should return false for non-existent keys in has()', async function () {
    const exists = await store.has('nonexistent');
    expect(exists).to.be.false;
  });

  it('should clear all keys with the specified prefix', async function () {
    await store.set('key1', 'value1');
    await store.set('key2', 'value2');
    await store.clear();
    const exists1 = await store.has('key1');
    const exists2 = await store.has('key2');
    expect(exists1).to.be.false;
    expect(exists2).to.be.false;
  });

  it('should serialize and deserialize values correctly', async function () {
    const obj = { a: 1, b: 'test', c: true };
    await store.set('objKey', JSON.stringify(obj));
    const value = await store.get('objKey');
    expect(value).to.equal(JSON.stringify(obj));
  });

  it('should allow custom key serialization', async function () {
    const customStore = new RedisStore<string, { id: string }>({
      redis,
      prefix,
      keySerializer: (key: { id: string }) => key.id,
    });

    await customStore.set({ id: 'customKey' }, 'customValue');
    const value = await customStore.get({ id: 'customKey' });
    expect(value).to.equal('customValue');
  });

  it('should allow custom value serialization/deserialization', async function () {
    const customStore = new RedisStore<number>({
      redis,
      prefix,
      valueSerializer: String,
      valueDeserializer: Number,
    });

    await customStore.set('numKey', 42);
    const value = await customStore.get('numKey');
    expect(value).to.equal(42);
  });

  it('should allow custom key serialization/deserialization', async function () {
    const customStore = new RedisStore<string, { id: number }>({
      redis,
      prefix,
      keySerializer: (key: { id: number }) => String(key.id),
      keyDeserializer: (key: string) => ({ id: Number(key) }),
    });

    await customStore.set({ id: 7 }, 'lucky');
    const value = await customStore.get({ id: 7 });
    expect(value).to.equal('lucky');
  });
});
