import * as vscode from "vscode";
import { ClaudeSessionDiscoveryService } from "./discovery";
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
    treeDataProvider: treeProvider
  });
  const sidebarTreeView = vscode.window.createTreeView("claudeSessionsSidebarView", {
    treeDataProvider: treeProvider
  });
  context.subscriptions.push(explorerTreeView);
  context.subscriptions.push(sidebarTreeView);

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
      const activeQuery = treeProvider.getFilterQuery();
      const filterMessage = activeQuery ? `Filter: "${activeQuery}"` : undefined;
      explorerTreeView.message = filterMessage;
      sidebarTreeView.message = filterMessage;
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
