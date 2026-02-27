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

export function parseRenameCommandArgs(rawPrompt: string): string | undefined {
  if (!/<command-name>\s*\/rename\s*<\/command-name>/u.test(rawPrompt)) {
    return undefined;
  }

  const match = rawPrompt.match(/<command-args>([\s\S]*?)<\/command-args>/u);
  if (!match) {
    return undefined;
  }

  return toNonEmptySingleLine(match[1]);
}

export function parseRenameStdoutTitle(rawPrompt: string): string | undefined {
  const match = rawPrompt.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/u);
  if (!match) {
    return undefined;
  }

  const stdoutText = toNonEmptySingleLine(match[1]);
  if (!stdoutText) {
    return undefined;
  }

  const renamePrefix = /^Session(?: and agent)? renamed to:\s*/iu;
  if (!renamePrefix.test(stdoutText)) {
    return undefined;
  }

  return toNonEmptySingleLine(stdoutText.replace(renamePrefix, ""));
}

export function toNonEmptySingleLine(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}
