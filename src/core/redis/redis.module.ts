import { Global, Module } from '@nestjs/common';
import {
  redisClientProvider,
  RedisService,
  REDIS_CLIENT,
} from './redis.service';

@Global()
@Module({
  providers: [redisClientProvider, RedisService],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
