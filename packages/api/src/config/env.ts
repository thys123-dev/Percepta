import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  ENCRYPTION_KEY: z.string().min(32),

  TAKEALOT_API_BASE_URL: z.string().url().default('https://seller-api.takealot.com'),

  WEBHOOK_PATH: z.string().default('/api/webhooks/takealot'),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('alerts@percepta.co.za'),

  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
