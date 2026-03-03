import * as vscode from "vscode";
import { ClaudeSessionDiscoveryService } from "./discovery";
import { deleteSession } from "./delete";
import { renameSession } from "./rename";
import { SessionNode, SessionPromptNode } from "./models";
import { registerSearchCommands } from "./search/searchCommand";
import { ClaudeTerminalService } from "./terminal";
import { ClaudeSessionsTreeDataProvider, truncateForTreeLabel } from "./treeProvider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Claude Sessions");
  const discovery = new ClaudeSessionDiscoveryService(outputChannel);
  const terminalService = new ClaudeTerminalService(outputChannel);
  const treeProvider = new ClaudeSessionsTreeDataProvider(discovery);
  outputChannel.appendLine("[lifecycle] Claude Sessions extension activated.");
  outputChannel.appendLine(`[lifecycle] workspaceFolders=${String(vscode.workspace.workspaceFolders?.length ?? 0)}`);

  context.subscriptions.push(outputChannel);
  let hasRefreshed = false;
  const lazyRefresh = async () => {
    if (!hasRefreshed) {
      hasRefreshed = true;
      await treeProvider.refresh();
    }
  };

  const explorerTreeView = vscode.window.createTreeView("claudeSessionsExplorer", {
    treeDataProvider: treeProvider,
    canSelectMany: true
  });
  const sidebarTreeView = vscode.window.createTreeView("claudeSessionsSidebarView", {
    treeDataProvider: treeProvider,
    canSelectMany: true
  });
  const checkedSessions = new Map<string, SessionNode>();
  context.subscriptions.push(explorerTreeView);
  context.subscriptions.push(sidebarTreeView);

  const syncHasChecked = () => {
    vscode.commands.executeCommand("setContext", "claudeSessions.hasCheckedSessions", checkedSessions.size > 0);
  };

  context.subscriptions.push(
    explorerTreeView.onDidChangeCheckboxState((e) => {
      for (const [node, state] of e.items) {
        if (node.kind === "session") {
          if (state === vscode.TreeItemCheckboxState.Checked) {
            checkedSessions.set(node.sessionId, node);
          } else {
            checkedSessions.delete(node.sessionId);
          }
        }
      }
      syncHasChecked();
    })
  );
  context.subscriptions.push(
    sidebarTreeView.onDidChangeCheckboxState((e) => {
      for (const [node, state] of e.items) {
        if (node.kind === "session") {
          if (state === vscode.TreeItemCheckboxState.Checked) {
            checkedSessions.set(node.sessionId, node);
          } else {
            checkedSessions.delete(node.sessionId);
          }
        }
      }
      syncHasChecked();
    })
  );

  const syncTreeViewMessages = () => {
    const msg = treeProvider.getStatusMessage();
    explorerTreeView.message = msg;
    sidebarTreeView.message = msg;
  };

  registerSearchCommands(context, discovery, treeProvider, outputChannel, {
    explorer: explorerTreeView,
    sidebar: sidebarTreeView
  });

  context.subscriptions.push(
    explorerTreeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        lazyRefresh();
      }
    })
  );
  context.subscriptions.push(
    sidebarTreeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        lazyRefresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.refresh", async () => {
      hasRefreshed = true;
      explorerTreeView.message = "Refreshing sessions...";
      sidebarTreeView.message = "Refreshing sessions...";
      await treeProvider.refresh();

      // Re-run filter against fresh data if one is active
      const activeQuery = treeProvider.getFilterQuery();
      if (activeQuery) {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        const entries = await discovery.getSearchableEntries(workspaceFolders);
        const lowerQuery = activeQuery.toLowerCase();
        const matchingIds = new Set<string>();
        for (const entry of entries) {
          if (entry.contentText.toLowerCase().includes(lowerQuery)) {
            matchingIds.add(entry.sessionId);
          }
        }
        treeProvider.setFilter(activeQuery, matchingIds);
      }

      // Clear selection mode
      treeProvider.setSelectionMode(false);
      checkedSessions.clear();
      syncHasChecked();
      vscode.commands.executeCommand("setContext", "claudeSessions.selectionMode", false);
      syncTreeViewMessages();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.openSession", async (session: SessionNode) => {
      if (!session || session.kind !== "session") {
        vscode.window.showErrorMessage("Unable to open session: invalid tree item payload.");
        return;
      }

      await terminalService.openSession(session);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.openSessionDangerously", async (session: SessionNode) => {
      if (!session || session.kind !== "session") {
        vscode.window.showErrorMessage("Unable to open session: invalid tree item payload.");
        return;
      }

      const confirmed = await confirmDangerousLaunch(session);
      if (!confirmed) {
        outputChannel.appendLine(`[terminal] Dangerous launch canceled for session ${session.sessionId}.`);
        return;
      }

      await terminalService.openSession(session, { dangerouslySkipPermissions: true });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.focusView", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.claudeSessionsContainer");
      await vscode.commands.executeCommand("claudeSessionsSidebarView.focus");
    })
  );

  const promptPanels = new Map<string, vscode.WebviewPanel>();

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.openPromptPreview", async (node: SessionPromptNode) => {
      if (!node || node.kind !== "sessionPrompt") {
        vscode.window.showErrorMessage("Unable to open prompt preview: invalid tree item payload.");
        return;
      }

      const uniqueId = `${node.sessionId}-${node.promptId}`;
      const existing = promptPanels.get(uniqueId);
      if (existing) {
        existing.reveal(vscode.ViewColumn.Beside);
        return;
      }

      const tabTitle = truncateForTreeLabel(node.promptTitle, 35);
      const panel = vscode.window.createWebviewPanel(
        "claudeSessionsPromptPreview",
        tabTitle,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false }
      );

      panel.webview.html = buildPromptPreviewHtml(node);
      promptPanels.set(uniqueId, panel);
      panel.onDidDispose(() => promptPanels.delete(uniqueId));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.renameSession", async (session: SessionNode) => {
      if (!session || session.kind !== "session") {
        vscode.window.showErrorMessage("Unable to rename session: invalid tree item payload.");
        return;
      }

      const newTitle = await vscode.window.showInputBox({
        prompt: "Enter a new title for this session",
        value: session.title,
        validateInput: (value) => (value.trim() ? null : "Title must not be empty")
      });

      if (newTitle === undefined) {
        return;
      }

      const result = await renameSession(session.transcriptPath, session.sessionId, newTitle);
      if (!result.success) {
        vscode.window.showErrorMessage(`Failed to rename session: ${result.error}`);
        outputChannel.appendLine(`[rename] Error renaming session ${session.sessionId}: ${result.error}`);
        return;
      }

      outputChannel.appendLine(`[rename] Session ${session.sessionId} renamed to "${newTitle.trim()}".`);
      discovery.invalidateSessionCache(session.transcriptPath);
      await treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.toggleSelectionMode", () => {
      const entering = !treeProvider.selectionMode;
      checkedSessions.clear();
      syncHasChecked();
      treeProvider.setSelectionMode(entering);
      vscode.commands.executeCommand("setContext", "claudeSessions.selectionMode", entering);
      syncTreeViewMessages();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claudeSessions.deleteSession",
      async (clicked: SessionNode | undefined, selected: SessionNode[] | undefined) => {
        let sessions: SessionNode[];
        if (treeProvider.selectionMode && checkedSessions.size > 0) {
          sessions = Array.from(checkedSessions.values());
        } else if (Array.isArray(selected) && selected.length > 0) {
          sessions = selected.filter((n) => n.kind === "session");
        } else if (clicked && clicked.kind === "session") {
          sessions = [clicked];
        } else {
          sessions = [
            ...explorerTreeView.selection.filter((n) => n.kind === "session"),
            ...sidebarTreeView.selection.filter((n) => n.kind === "session")
          ] as SessionNode[];
        }

        if (sessions.length === 0) {
          vscode.window.showErrorMessage("Unable to delete session: no valid session selected.");
          return;
        }

        const confirmLabel = "Delete";
        let confirmMessage: string;
        let confirmDetail: string;

        if (sessions.length === 1) {
          confirmMessage = `Delete session "${sessions[0].title}"?`;
        } else {
          confirmMessage = `Delete ${String(sessions.length)} sessions?`;
        }

        const titlesToList = sessions.slice(0, 5).map((s) => `• ${s.title}`);
        const overflowCount = sessions.length - titlesToList.length;
        const titleLines = overflowCount > 0 ? [...titlesToList, `...and ${String(overflowCount)} more`] : titlesToList;
        confirmDetail =
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
        await treeProvider.refresh();
        vscode.commands.executeCommand("setContext", "claudeSessions.selectionMode", false);
        checkedSessions.clear();
        syncHasChecked();
        treeProvider.setSelectionMode(false);
        syncTreeViewMessages();

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
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      outputChannel.appendLine("[lifecycle] Workspace folders changed. Refreshing tree.");
      hasRefreshed = true;
      await treeProvider.refresh();
    })
  );
}

export function deactivate(): void {
  // no-op
}

async function confirmDangerousLaunch(session: SessionNode): Promise<boolean> {
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
        `Session: ${session.title}`,
        "Use this only for trusted repos and prompts."
      ].join("\n")
    },
    acceptLabel
  );

  return response === acceptLabel;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildPromptPreviewHtml(node: SessionPromptNode): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; line-height: 1.5; }
  h1 { font-size: 1.4em; margin-bottom: 0.5em; }
  h2 { font-size: 1.1em; margin-top: 1.5em; }
  ul { padding-left: 1.5em; }
  code { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15)); padding: 2px 4px; border-radius: 3px; }
  pre { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15)); padding: 12px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
</style>
</head>
<body>
  <h1>${escapeHtml(node.sessionTitle)}</h1>
  <ul>
    <li>Session ID: <code>${escapeHtml(node.sessionId)}</code></li>
    <li>Prompt #: ${String(node.promptIndex + 1)}</li>
    <li>Timestamp: ${escapeHtml(node.timestampIso ?? "unavailable")}</li>
  </ul>
  <h2>User Prompt</h2>
  <pre>${escapeHtml(node.promptRaw)}</pre>
</body>
</html>`;
}
