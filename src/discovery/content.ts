import { TranscriptRecord } from "./types";

function extractTextFromBlock(block: Record<string, unknown>): string {
  if (typeof block.text === "string") {
    return block.text;
  }
  if (typeof block.thinking === "string") {
    return block.thinking;
  }
  return "";
}

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
        return extractTextFromBlock(part as Record<string, unknown>);
      })
      .filter((part) => part.length > 0);

    return parts.join("\n");
  }

  if (content && typeof content === "object") {
    return extractTextFromBlock(content as Record<string, unknown>);
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
