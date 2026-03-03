import * as vscode from "vscode";
import { SessionNode } from "../models";
import { ISessionDiscoveryService } from "../discovery/types";
import { SessionTreeStateManager } from "../webview/SessionTreeStateManager";
import { deleteSession } from "../delete";

export async function confirmAndDeleteSessions(
  sessions: SessionNode[],
  discovery: ISessionDiscoveryService,
  stateManager: SessionTreeStateManager,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  if (sessions.length === 0) {
    return;
  }

  const confirmLabel = "Delete";
  let confirmMessage: string;

  if (sessions.length === 1) {
    confirmMessage = `Delete session "${sessions[0].title}"?`;
  } else {
    confirmMessage = `Delete ${String(sessions.length)} sessions?`;
  }

  const titlesToList = sessions.slice(0, 5).map((s) => `• ${s.title}`);
  const overflowCount = sessions.length - titlesToList.length;
  const titleLines = overflowCount > 0 ? [...titlesToList, `...and ${String(overflowCount)} more`] : titlesToList;
  const confirmDetail =
    (sessions.length > 1 ? titleLines.join("\n") + "\n\n" : "") +
    "This will permanently remove the session transcript(s) and all associated data.";

  const response = await vscode.window.showWarningMessage(
    confirmMessage,
    { modal: true, detail: confirmDetail },
    confirmLabel
  );

  if (response !== confirmLabel) {
    return;
  }

  let successCount = 0;
  let failureCount = 0;
  const uniqueTranscriptPaths = new Set<string>();

  for (const session of sessions) {
    const result = await deleteSession(session.transcriptPath, session.sessionId);
    if (result.success) {
      outputChannel.appendLine(
        `[delete] Session ${session.sessionId} deleted. Removed paths: ${result.deletedPaths.join(", ")}`
      );
      successCount++;
    } else {
      outputChannel.appendLine(`[delete] Error deleting session ${session.sessionId}: ${result.error}`);
      failureCount++;
    }
    uniqueTranscriptPaths.add(session.transcriptPath);
  }

  for (const transcriptPath of uniqueTranscriptPaths) {
    discovery.invalidateSessionCache(transcriptPath);
  }

  stateManager.clearChecked();
  stateManager.setSelectionMode(false);
  vscode.commands.executeCommand("setContext", "claudeSessions.selectionMode", false);
  vscode.commands.executeCommand("setContext", "claudeSessions.hasCheckedSessions", false);
  await stateManager.refresh();

  if (failureCount === 0) {
    if (successCount === 1) {
      vscode.window.showInformationMessage("Session deleted.");
    } else {
      vscode.window.showInformationMessage(`${String(successCount)} sessions deleted.`);
    }
  } else if (successCount > 0) {
    vscode.window.showWarningMessage(
      `Deleted ${String(successCount)} of ${String(sessions.length)} sessions. Some sessions could not be removed.`
    );
  } else {
    vscode.window.showErrorMessage("Failed to delete session(s).");
  }
}

export async function confirmDangerousLaunch(sessionTitle: string): Promise<boolean> {
  const config = vscode.workspace.getConfiguration("claudeSessions");
  const shouldConfirm = config.get<boolean>("confirmDangerousSkipPermissions", true);
  if (!shouldConfirm) {
    return true;
  }

  const acceptLabel = "Open With Full Access";
  const response = await vscode.window.showWarningMessage(
    "This will run Claude with --dangerously-skip-permissions.",
    {
      modal: true,
      detail: [
        "Claude will run without normal permission prompts in this terminal session.",
        `Session: ${sessionTitle}`,
        "Use this only for trusted repos and prompts."
      ].join("\n")
    },
    acceptLabel
  );

  return response === acceptLabel;
}
