import { z } from "zod";

const envSchema = z.object({
  AGENTMAIL_API_KEY: z.string().optional(),
  AGENTMAIL_WEBHOOK_SECRET: z.string().optional(),
  AGENTMAIL_DOMAIN: z.string().default("tc.example.com"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000")
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}

export function requireEnv<K extends keyof AppEnv>(key: K): NonNullable<AppEnv[K]> {
  const value = getEnv()[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value as NonNullable<AppEnv[K]>;
}
