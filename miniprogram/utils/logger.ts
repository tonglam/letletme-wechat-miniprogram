import { getMiniProgramEnv } from "../config/env";

type LogValue = string | number | boolean | null | undefined;

function bounded(value: unknown): LogValue {
  if (typeof value === "string") return value.slice(0, 160);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return value == null ? value : "[object]";
}

function emit(level: "info" | "warn" | "error", code: string, value?: unknown): void {
  const env = getMiniProgramEnv();
  const safeCode = String(code || "diagnostic").slice(0, 80);
  const sink = console as unknown as Record<string, (...args: unknown[]) => void>;
  if (env === "release") {
    sink[level]?.(`[${level}] ${safeCode}`);
    return;
  }
  sink[level]?.(`[${level}] ${safeCode}`, bounded(value));
}

export const miniLogger = {
  info(code: string, value?: unknown) { emit("info", code, value); },
  warn(code: string, value?: unknown) { emit("warn", code, value); },
  error(code: string, value?: unknown) { emit("error", code, value); }
};
