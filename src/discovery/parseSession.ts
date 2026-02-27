import * as fs from "fs";
import * as readline from "readline";
import * as vscode from "vscode";
import { extractText, isDisplayableUserPrompt, isRecord } from "./content";
import { isPathWithin, normalizeFsPath } from "./pathUtils";
import { chooseSessionTitleRaw, parseRenameCommandArgs, parseRenameStdoutTitle, toNonEmptySingleLine } from "./title";
import { ParsedSession } from "./types";

export async function parseTranscriptFile(transcriptPath: string, log: (msg: string) => void): Promise<ParsedSession | null> {
  const stream = fs.createReadStream(transcriptPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let sessionId: string | undefined;
  let cwd: string | undefined;
  let firstPromptRaw: string | undefined;
  let firstUserRaw: string | undefined;
  let latestExplicitTitle: string | undefined;

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

      if (!sessionId && typeof parsed.sessionId === "string" && parsed.sessionId.trim() !== "") {
        sessionId = parsed.sessionId;
      }

      if (!cwd && typeof parsed.cwd === "string" && parsed.cwd.trim() !== "") {
        cwd = parsed.cwd;
      }

      if (parsed.type === "custom-title") {
        const customTitle = toNonEmptySingleLine(parsed.customTitle);
        if (customTitle) {
          latestExplicitTitle = customTitle;
        }
      }

      if (parsed.type === "agent-name") {
        const agentName = toNonEmptySingleLine(parsed.agentName);
        if (agentName) {
          latestExplicitTitle = agentName;
        }
      }

      if (parsed.type === "user" && parsed.message?.role === "user") {
        const text = extractText(parsed.message.content);
        if (text.trim()) {
          if (!firstUserRaw) {
            firstUserRaw = text;
          }
          if (!firstPromptRaw && isDisplayableUserPrompt(text)) {
            firstPromptRaw = text;
          }

          const renameArgsTitle = parseRenameCommandArgs(text);
          if (renameArgsTitle) {
            latestExplicitTitle = renameArgsTitle;
          }

          const renameStdoutTitle = parseRenameStdoutTitle(text);
          if (renameStdoutTitle) {
            latestExplicitTitle = renameStdoutTitle;
          }
        }
      }
    }
  } finally {
    rl.close();
    stream.close();
  }

  if (!sessionId || !cwd) {
    return null;
  }

  return {
    sessionId,
    cwd,
    titleSourceRaw: chooseSessionTitleRaw({
      latestExplicitTitle,
      firstPromptRaw,
      firstUserRaw
    }) ?? ""
  };
}

export function matchWorkspace(
  sessionCwd: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[]
): vscode.WorkspaceFolder | undefined {
  const normalizedCwd = normalizeFsPath(sessionCwd);
  const matching = workspaceFolders
    .filter((folder) => isPathWithin(normalizedCwd, normalizeFsPath(folder.uri.fsPath)))
    .sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length);

  return matching[0];
}
