import { promises as fsp } from "fs";
import * as path from "path";

export interface DeleteResult {
  success: boolean;
  deletedPaths: string[];
  error?: string;
}

export async function deleteSession(transcriptPath: string, sessionId: string): Promise<DeleteResult> {
  const deletedPaths: string[] = [];

  try {
    // Derive ~/.claude/ root by walking up from the transcript path.
    // transcriptPath looks like: ~/.claude/projects/-PROJECT/SESSION.jsonl
    const projectsDir = path.dirname(transcriptPath);
    const claudeRoot = path.dirname(path.dirname(projectsDir));

    const targets = [
      // Main transcript file
      transcriptPath,
      // Subagents + tool results directory
      path.join(projectsDir, sessionId),
      // Environment snapshot directory
      path.join(claudeRoot, "session-env", sessionId),
      // File version history directory
      path.join(claudeRoot, "file-history", sessionId),
      // Debug log file
      path.join(claudeRoot, "debug", `${sessionId}.txt`),
      // Task data directory (team sessions)
      path.join(claudeRoot, "tasks", sessionId)
    ];

    for (const target of targets) {
      try {
        const stat = await fsp.stat(target);
        if (stat.isDirectory()) {
          await fsp.rm(target, { recursive: true, force: true });
        } else {
          await fsp.unlink(target);
        }
        deletedPaths.push(target);
      } catch {
        // Path doesn't exist — skip silently
      }
    }

    return { success: true, deletedPaths };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, deletedPaths, error: message };
  }
}
