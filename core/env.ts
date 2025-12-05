import { z } from 'zod';

const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('5001'),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_URL: z.string().optional(),
  API_KEY: z.string().optional(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('6379'),
  REDIS_PASSWORD: z.string().optional(),

  // Twitter
  TWITTER_DEFAULT_MODE: z.enum(['graphql', 'puppeteer', 'mixed']).default('graphql'),
  TWITTER_DEFAULT_LIMIT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('50'),

  // Reddit
  REDDIT_API_URL: z.string().default('http://127.0.0.1:5002'),
  REDDIT_API_PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('5002'),

  // Browser
  BROWSER_HEADLESS: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('true'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const env = envSchema.parse(process.env);
