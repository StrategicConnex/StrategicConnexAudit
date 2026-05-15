
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

console.log('URL:', process.env.UPSTASH_REDIS_REST_URL);
console.log('TOKEN:', process.env.UPSTASH_REDIS_REST_TOKEN ? 'EXISTS' : 'MISSING');
