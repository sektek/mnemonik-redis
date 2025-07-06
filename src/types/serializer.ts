import { Component } from '@sektek/utility-belt';
import { RedisValue } from 'ioredis';

export type SerializerFn<T, O = RedisValue> = (value: T) => PromiseLike<O> | O;

export interface Serializer<T, O = RedisValue> {
  serialize: SerializerFn<T, O>;
}

export type SerializerComponent<T, O = RedisValue> = Component<
  Serializer<T, O>,
  'serialize'
>;
