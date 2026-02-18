import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_RUNTIME_MODE: z.enum(["full", "lite"]).default("full"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://postgres:postgres@localhost:5432/avatar_os"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default("replace-this-with-a-32-byte-minimum-encryption-key")
    .describe("Base64 or plain-text key for AES-256-GCM"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  APP_URL: z.string().default("http://localhost:3000"),
});

export type AppConfig = z.infer<typeof configSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cachedConfig) return cachedConfig;
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  cachedConfig = parsed.data;
  return cachedConfig;
}

export function isLiteRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return getConfig(env).APP_RUNTIME_MODE === "lite";
}
