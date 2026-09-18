import { Redis } from "@upstash/redis";

let redis: Redis;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL!,
      token: process.env.UPSTASH_REDIS_TOKEN!,
    });
  }
  return redis;
}

export async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const client = getRedis();
  const cachedValue = await client.get<T>(key);
  if (cachedValue !== null) return cachedValue;
  const value = await fn();
  await client.set(key, value, { ex: ttl });
  return value;
}
