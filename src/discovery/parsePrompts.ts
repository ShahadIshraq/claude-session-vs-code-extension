import * as fs from "fs";
import * as readline from "readline";
import { extractText, isDisplayableUserPrompt, isRecord } from "./content";
import { buildTitle } from "./title";
import { SessionPrompt } from "./types";

const MAX_RESPONSE_LENGTH = 50_000;

export async function parseAllUserPrompts(
  transcriptPath: string,
  fallbackSessionId: string,
  log: (msg: string) => void
): Promise<SessionPrompt[]> {
  const stream = fs.createReadStream(transcriptPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const prompts: SessionPrompt[] = [];
  let promptIndex = 0;

  try {
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        log(`[discovery] malformed JSON in ${transcriptPath}: ${String(error)}`);
        continue;
      }

      if (!isRecord(parsed)) {
        continue;
      }

      if (parsed.type === "assistant" && parsed.message?.role === "assistant") {
        const responseText = extractText(parsed.message.content);
        if (responseText.trim() && prompts.length > 0) {
          const prev = prompts[prompts.length - 1];
          const existing = prev.responseRaw ?? "";
          if (existing.length < MAX_RESPONSE_LENGTH) {
            const combined = existing ? `${existing}\n${responseText}` : responseText;
            prompts[prompts.length - 1] = {
              ...prev,
              responseRaw: combined.length > MAX_RESPONSE_LENGTH ? combined.slice(0, MAX_RESPONSE_LENGTH) : combined
            };
          }
        }
        continue;
      }

      if (!(parsed.type === "user" && parsed.message?.role === "user")) {
        continue;
      }

      const promptRaw = extractText(parsed.message.content);
      if (!promptRaw.trim()) {
        continue;
      }

      if (!isDisplayableUserPrompt(promptRaw)) {
        continue;
      }

      const timestampIso = typeof parsed.timestamp === "string" ? parsed.timestamp : undefined;
      const parsedTimestamp = timestampIso ? Date.parse(timestampIso) : Number.NaN;
      const timestampMs = Number.isFinite(parsedTimestamp) ? parsedTimestamp : undefined;
      const sessionId =
        typeof parsed.sessionId === "string" && parsed.sessionId.trim() !== "" ? parsed.sessionId : fallbackSessionId;

      prompts.push({
        promptId:
          typeof parsed.uuid === "string" && parsed.uuid.trim() !== ""
            ? parsed.uuid
            : `${fallbackSessionId}:${promptIndex}`,
        sessionId,
        promptRaw,
        promptTitle: buildTitle(promptRaw, fallbackSessionId),
        timestampIso,
        timestampMs
      });
      promptIndex += 1;
    }
  } finally {
    rl.close();
    stream.close();
  }

  return prompts;
}
