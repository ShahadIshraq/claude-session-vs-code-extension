import * as fs from "fs";
import { promises as fsp } from "fs";
import * as path from "path";

export async function collectTranscriptFiles(rootDir: string, log: (msg: string) => void): Promise<string[]> {
  const collected: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      log(`[discovery] readdir failed for ${currentDir}: ${String(error)}`);
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "subagents") {
          continue;
        }
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.endsWith(".jsonl")) {
        continue;
      }

      if (entry.name.startsWith("agent-")) {
        continue;
      }

      collected.push(fullPath);
    }
  }

  return collected;
}

export async function exists(targetPath: string): Promise<boolean> {
  try {
    await fsp.access(targetPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
