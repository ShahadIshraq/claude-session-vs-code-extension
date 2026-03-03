import * as vscode from "vscode";
import { ClaudeSessionDiscoveryService } from "./discovery";
import { ClaudeTerminalService } from "./terminal";
import { SessionTreeStateManager, SessionTreeViewProvider } from "./webview";
import { SessionNode, SessionPromptNode } from "./models";
import { registerSearchCommands } from "./search/searchCommand";
import { truncateForTreeLabel } from "./utils/formatting";
import { confirmAndDeleteSessions, confirmDangerousLaunch } from "./utils/sessionActions";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Claude Sessions");
  const discovery = new ClaudeSessionDiscoveryService(outputChannel);
  const terminalService = new ClaudeTerminalService(outputChannel);
  const stateManager = new SessionTreeStateManager(discovery);
  outputChannel.appendLine("[lifecycle] Claude Sessions extension activated.");
  outputChannel.appendLine(`[lifecycle] workspaceFolders=${String(vscode.workspace.workspaceFolders?.length ?? 0)}`);

  context.subscriptions.push(outputChannel);

  let hasRefreshed = false;
  const lazyRefresh = async () => {
    if (!hasRefreshed) {
      hasRefreshed = true;
      await stateManager.refresh();
    }
  };

  // Prompt preview panels
  const promptPanels = new Map<string, vscode.WebviewPanel>();

  const openPromptPreview = (node: SessionPromptNode) => {
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
  };

  // Create two webview providers sharing the same state
  const explorerProvider = new SessionTreeViewProvider(
    context.extensionUri,
    stateManager,
    terminalService,
    discovery,
    outputChannel,
    openPromptPreview
  );

  const sidebarProvider = new SessionTreeViewProvider(
    context.extensionUri,
    stateManager,
    terminalService,
    discovery,
    outputChannel,
    openPromptPreview
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("claudeSessionsExplorer", explorerProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("claudeSessionsSidebarView", sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Register search commands
  registerSearchCommands(
    context,
    () => {
      explorerProvider.postFocusSearch();
      sidebarProvider.postFocusSearch();
    },
    () => {
      stateManager.setFilter(undefined, undefined);
      vscode.commands.executeCommand("setContext", "claudeSessions.filterActive", false);
    }
  );

  // Lazy refresh on activation
  lazyRefresh();

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.refresh", async () => {
      hasRefreshed = true;
      await stateManager.refresh();

      // Re-run filter against fresh data if one is active
      const activeQuery = stateManager.getFilterQuery();
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
        stateManager.setFilter(activeQuery, matchingIds);
      }

      // Clear selection mode
      stateManager.setSelectionMode(false);
      vscode.commands.executeCommand("setContext", "claudeSessions.selectionMode", false);
      vscode.commands.executeCommand("setContext", "claudeSessions.hasCheckedSessions", false);
    })
  );

  // Open session commands (for toolbar/command palette use)
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.openSession", async (session: SessionNode) => {
      if (!session || session.kind !== "session") {
        return;
      }
      await terminalService.openSession(session);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.openSessionDangerously", async (session: SessionNode) => {
      if (!session || session.kind !== "session") {
        return;
      }
      const confirmed = await confirmDangerousLaunch(session.title);
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

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.openPromptPreview", async (node: SessionPromptNode) => {
      if (!node || node.kind !== "sessionPrompt") {
        return;
      }
      openPromptPreview(node);
    })
  );

  // Rename command (triggers inline rename via webview)
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.renameSession", async (session: SessionNode) => {
      if (!session || session.kind !== "session") {
        return;
      }
      explorerProvider.postStartRename(session.sessionId);
      sidebarProvider.postStartRename(session.sessionId);
    })
  );

  // Toggle selection mode
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.toggleSelectionMode", () => {
      const entering = !stateManager.selectionMode;
      stateManager.clearChecked();
      stateManager.setSelectionMode(entering);
      vscode.commands.executeCommand("setContext", "claudeSessions.selectionMode", entering);
      vscode.commands.executeCommand("setContext", "claudeSessions.hasCheckedSessions", false);
    })
  );

  // Delete checked sessions (toolbar button)
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.deleteSession", async () => {
      // In webview mode, bulk delete is handled by the webview provider via deleteChecked message
      // This command is kept for the toolbar button
      const sessions = stateManager.getCheckedSessions();
      await confirmAndDeleteSessions(sessions, discovery, stateManager, outputChannel);
    })
  );

  // Workspace folders changed
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      outputChannel.appendLine("[lifecycle] Workspace folders changed. Refreshing tree.");
      hasRefreshed = true;
      await stateManager.refresh();
    })
  );
}

export function deactivate(): void {
  // no-op
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
