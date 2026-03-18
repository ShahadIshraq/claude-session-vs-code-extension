import * as vscode from "vscode";
import { ClaudeSessionDiscoveryService } from "./discovery";
import { ClaudeTerminalService } from "./terminal";
import { SessionTreeStateManager, SessionTreeViewProvider } from "./webview";
import { SessionNode, SessionPromptNode } from "./models";
import { registerSearchCommands } from "./search/searchCommand";
import { truncateForTreeLabel } from "./utils/formatting";
import { confirmAndDeleteSessions, confirmDangerousLaunch } from "./utils/sessionActions";
import { buildSessionViewHtml } from "./sessionViewHtml";
import { md, htmlDocument, renderMessageBlock, escapeHtml, formatTimestamp } from "./viewHtml";
export { escapeHtml } from "./viewHtml";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const currentVersion = (
    vscode.extensions.getExtension("ShahadIshraq.vscode-claude-sessions")?.packageJSON as
      | { version?: string }
      | undefined
  )?.version as string | undefined;
  const previousVersion = context.globalState.get<string>("extensionVersion");
  if (previousVersion && currentVersion && previousVersion !== currentVersion) {
    void vscode.window
      .showInformationMessage(
        `Claude Sessions updated to v${currentVersion}. Please reload the window for changes to take effect.`,
        "Reload Window"
      )
      .then((choice) => {
        if (choice === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  }
  if (currentVersion) {
    void context.globalState.update("extensionVersion", currentVersion);
  }

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
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false }
    );

    panel.webview.html = buildPromptPreviewHtml(node);
    promptPanels.set(uniqueId, panel);
    panel.onDidDispose(() => promptPanels.delete(uniqueId));
  };

  // Session view panels (read-only full conversation)
  const sessionViewPanels = new Map<string, vscode.WebviewPanel>();
  const sessionViewInFlight = new Set<string>();

  const openSessionView = async (session: SessionNode) => {
    const existing = sessionViewPanels.get(session.sessionId);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Beside);
      return;
    }
    if (sessionViewInFlight.has(session.sessionId)) {
      return;
    }
    sessionViewInFlight.add(session.sessionId);

    try {
      const prompts = await discovery.getUserPrompts(session);

      const tabTitle = truncateForTreeLabel(session.title, 35);
      const panel = vscode.window.createWebviewPanel(
        "claudeSessionsView",
        tabTitle,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: false }
      );

      panel.webview.html = buildSessionViewHtml(session, prompts);
      sessionViewPanels.set(session.sessionId, panel);
      panel.onDidDispose(() => sessionViewPanels.delete(session.sessionId));
    } catch (err) {
      outputChannel.appendLine(`[viewSession] Failed to open session ${session.sessionId}: ${String(err)}`);
      void vscode.window.showErrorMessage(`Failed to open session: ${String(err)}`);
    } finally {
      sessionViewInFlight.delete(session.sessionId);
    }
  };

  // Create two webview providers sharing the same state
  const explorerProvider = new SessionTreeViewProvider(
    context.extensionUri,
    stateManager,
    terminalService,
    discovery,
    outputChannel,
    openPromptPreview,
    openSessionView
  );

  const sidebarProvider = new SessionTreeViewProvider(
    context.extensionUri,
    stateManager,
    terminalService,
    discovery,
    outputChannel,
    openPromptPreview,
    openSessionView
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

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.viewSession", async (session: SessionNode) => {
      if (!session || session.kind !== "session") {
        return;
      }
      await openSessionView(session);
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

export function buildPromptPreviewHtml(node: SessionPromptNode): string {
  const ts = formatTimestamp(node.timestampMs, node.timestampIso) || "unavailable";

  const responseBlock = node.responseRaw ? renderMessageBlock("assistant", md.render(node.responseRaw)) : "";

  const extraStyles = `
  .prompt-header {
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .prompt-header h1 { font-size: 1.3em; margin: 0 0 6px 0; }
  .prompt-meta {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .prompt-meta code {
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.95em;
  }`;

  const body = `
  <div class="prompt-header">
    <h1>${escapeHtml(node.sessionTitle)}</h1>
    <div class="prompt-meta">
      <span>Session: <code>${escapeHtml(node.sessionId)}</code></span>
      <span>Prompt #${String(node.promptIndex + 1)}</span>
      <span>${escapeHtml(ts)}</span>
    </div>
  </div>
  ${renderMessageBlock("user", md.render(node.promptRaw))}
  ${responseBlock}`;

  return htmlDocument(extraStyles, body);
}
