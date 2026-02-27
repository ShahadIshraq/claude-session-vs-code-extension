import * as vscode from "vscode";
import { ClaudeSessionDiscoveryService } from "./discovery";
import { SessionNode, SessionPromptNode } from "./models";
import { ClaudeTerminalService } from "./terminal";
import { ClaudeSessionsTreeDataProvider } from "./treeProvider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("Claude Sessions");
  const discovery = new ClaudeSessionDiscoveryService(outputChannel);
  const terminalService = new ClaudeTerminalService(outputChannel);
  const treeProvider = new ClaudeSessionsTreeDataProvider(discovery);
  const promptPreviewProvider = new PromptPreviewDocumentProvider();
  outputChannel.appendLine("[lifecycle] Claude Sessions extension activated.");
  outputChannel.appendLine(
    `[lifecycle] workspaceFolders=${String(vscode.workspace.workspaceFolders?.length ?? 0)}`
  );

  context.subscriptions.push(outputChannel);
  context.subscriptions.push(promptPreviewProvider);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("claude-sessions-prompt", promptPreviewProvider)
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("claudeSessionsExplorer", treeProvider)
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("claudeSessionsSidebarView", treeProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.refresh", async () => {
      await treeProvider.refresh();
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

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.openPromptPreview", async (node: SessionPromptNode) => {
      if (!node || node.kind !== "sessionPrompt") {
        vscode.window.showErrorMessage("Unable to open prompt preview: invalid tree item payload.");
        return;
      }

      const content = buildPromptPreviewDocument(node);
      const uri = promptPreviewProvider.setContent(`${node.sessionId}-${node.promptId}`, content);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        preview: true,
        viewColumn: vscode.ViewColumn.Beside
      });
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      outputChannel.appendLine("[lifecycle] Workspace folders changed. Refreshing tree.");
      await treeProvider.refresh();
    })
  );

  outputChannel.appendLine("[discovery] Initial refresh.");
  await treeProvider.refresh();
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

function buildPromptPreviewDocument(node: SessionPromptNode): string {
  const header = [
    `# ${escapeMarkdown(node.sessionTitle)}`,
    "",
    `- Session ID: \`${node.sessionId}\``,
    `- Prompt #: ${String(node.promptIndex + 1)}`,
    `- Timestamp: ${node.timestampIso ?? "unavailable"}`,
    "",
    "## User Prompt",
    "",
    "```text",
    node.promptRaw,
    "```"
  ];

  return header.join("\n");
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

class PromptPreviewDocumentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly contentByUri = new Map<string, string>();

  public readonly onDidChange = this.onDidChangeEmitter.event;

  public setContent(key: string, content: string): vscode.Uri {
    const uri = vscode.Uri.parse(`claude-sessions-prompt:/${encodeURIComponent(key)}.md`);
    this.contentByUri.set(uri.toString(), content);
    this.onDidChangeEmitter.fire(uri);
    return uri;
  }

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contentByUri.get(uri.toString()) ?? "# Prompt preview is unavailable.";
  }

  public dispose(): void {
    this.contentByUri.clear();
    this.onDidChangeEmitter.dispose();
  }
}
