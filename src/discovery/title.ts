import { SessionTitleSourceOptions } from "./types";

export function buildTitle(rawPrompt: string, sessionId: string): string {
  const firstLine = rawPrompt
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  const fallback = `Session ${sessionId.slice(0, 8)}`;
  if (!firstLine) {
    return fallback;
  }

  const sanitized = firstLine
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) {
    return fallback;
  }

  if (sanitized.length <= 80) {
    return sanitized;
  }

  return `${sanitized.slice(0, 77)}...`;
}

export function chooseSessionTitleRaw(options: SessionTitleSourceOptions): string | undefined {
  const explicit = toNonEmptySingleLine(options.latestExplicitTitle);
  if (explicit) {
    return explicit;
  }
  if (options.firstPromptRaw && options.firstPromptRaw.trim()) {
    return options.firstPromptRaw;
  }
  if (options.firstUserRaw && options.firstUserRaw.trim()) {
    return options.firstUserRaw;
  }
  return undefined;
}

export function toNonEmptySingleLine(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}
