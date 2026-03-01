import { promises as fsp } from "fs";

export interface RenameResult {
  success: boolean;
  error?: string;
}

export async function renameSession(
  transcriptPath: string,
  sessionId: string,
  newTitle: string
): Promise<RenameResult> {
  const trimmed = newTitle.trim();
  if (!trimmed) {
    return { success: false, error: "Title must not be empty." };
  }

  const record = JSON.stringify({
    type: "custom-title",
    customTitle: trimmed,
    sessionId
  });

  try {
    await fsp.appendFile(transcriptPath, `\n${record}\n`, "utf8");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to write rename record: ${message}` };
  }
}
