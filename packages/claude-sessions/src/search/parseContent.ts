import * as fs from "fs";
import * as readline from "readline";
import { extractText, isDisplayableUserPrompt, isRecord } from "../discovery/content";

const CONTENT_CAP_CHARS = 200 * 1024;

export async function parseSessionContent(transcriptPath: string, log: (msg: string) => void): Promise<string> {
  const stream = fs.createReadStream(transcriptPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const parts: string[] = [];
  let totalLength = 0;
  let capped = false;

  try {
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        log(`[search] malformed JSON in ${transcriptPath}: ${String(error)}`);
        continue;
      }

      if (!isRecord(parsed)) {
        continue;
      }

      const type = parsed.type;
      const role = parsed.message?.role;

      if (type === "user" && role === "user") {
        const text = extractText(parsed.message?.content);
        if (!text.trim()) {
          continue;
        }
        if (!isDisplayableUserPrompt(text)) {
          continue;
        }
        parts.push(text);
        totalLength += text.length;
      } else if (type === "assistant" && role === "assistant") {
        const text = extractText(parsed.message?.content);
        if (!text.trim()) {
          continue;
        }
        parts.push(text);
        totalLength += text.length;
      } else {
        continue;
      }

      if (totalLength >= CONTENT_CAP_CHARS) {
        capped = true;
        break;
      }
    }
  } finally {
    rl.close();
    stream.close();
  }

  if (capped) {
    log(`[search] content cap reached for ${transcriptPath}`);
  }

  return parts.join("\n");
}
