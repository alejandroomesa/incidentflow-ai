import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),

  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  CLAUDE_MODEL: z.string().min(1).default('nvidia/nemotron-nano-9b-v2:free'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(60_000),
  AI_MAX_TOKENS: z.coerce.number().int().min(500).max(4_000).default(1_600),

  WEBHOOK_SECRET: z.string().min(1),
  WEBHOOK_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),

  ALLOWED_SERVICES_TO_RESTART: z
    .string()
    .default('api-gateway,web-server,worker-queue')
    .transform((s) => s.split(',').map((name) => name.trim()).filter(Boolean)),
  ACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AUTO_RESOLVE_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
