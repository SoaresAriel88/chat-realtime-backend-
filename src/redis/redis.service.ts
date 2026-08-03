import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
  }

  async setValue(key: string, value: string) {
    return this.client.set(key, value);
  }

  async getValue(key: string) {
    return this.client.get(key);
  }

  async setWithExpiration(key: string, value: string, seconds: number) {
    return this.client.set(key, value, 'EX', seconds);
  }

  async deleteKey(key: string) {
    return this.client.del(key);
  }

  async exists(key: string) {
    return this.client.exists(key);
  }

  async getTTL(key: string) {
    return this.client.ttl(key);
  }
  async increment(key: string) {
    return this.client.incr(key);
  }
  async expire(key: string, seconds: number) {
    return this.client.expire(key, seconds);
  }
}
