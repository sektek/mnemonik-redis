import { Component } from '@sektek/utility-belt';
import { RedisValue } from 'ioredis';

export type DeserializerFn<T, I = RedisValue> = (
  value: I,
) => PromiseLike<T> | T;
export interface Deserializer<T, I = RedisValue> {
  deserialize: DeserializerFn<T, I>;
}
export type DeserializerComponent<T, I = RedisValue> = Component<
  Deserializer<T, I>,
  'deserialize'
>;
