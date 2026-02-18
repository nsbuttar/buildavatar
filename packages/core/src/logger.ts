export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogMeta {
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, meta: LogMeta = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const encoded = JSON.stringify(payload);
  if (level === "error") {
    console.error(encoded);
    return;
  }
  if (level === "warn") {
    console.warn(encoded);
    return;
  }
  console.log(encoded);
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => emit("debug", message, meta),
  info: (message: string, meta?: LogMeta) => emit("info", message, meta),
  warn: (message: string, meta?: LogMeta) => emit("warn", message, meta),
  error: (message: string, meta?: LogMeta) => emit("error", message, meta),
};

