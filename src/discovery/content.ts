import { TranscriptRecord } from "./types";

export function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (!part || typeof part !== "object") {
          return "";
        }
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .filter((part) => part.length > 0);

    return parts.join("\n");
  }

  if (content && typeof content === "object") {
    const text = (content as { text?: unknown }).text;
    if (typeof text === "string") {
      return text;
    }
  }

  return "";
}

export function isDisplayableUserPrompt(rawPrompt: string): boolean {
  const normalized = rawPrompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  const hiddenPrefixes = [
    "<local-command-caveat>",
    "<command-name>",
    "<command-message>",
    "<command-args>",
    "<local-command-stdout>",
    "<local-command-stderr>",
    "<local-command-exit-code>",
    "<usage>",
    "agentId:"
  ];

  return !hiddenPrefixes.some((prefix) => normalized.startsWith(prefix));
}

export function isRecord(value: unknown): value is TranscriptRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  return true;
}
