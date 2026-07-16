import * as vscode from "vscode";
import { SessionTreeStateManager } from "./SessionTreeStateManager";
import { WebviewToExtensionMessage } from "./messages";
import { getWebviewHtml, getNonce } from "./getWebviewHtml";
import { renameSession } from "../rename";
import { ClaudeTerminalService } from "../terminal";
import { ISessionDiscoveryService } from "../discovery/types";
import { SessionPromptNode, SessionNode } from "../models";
import { confirmAndDeleteSessions, confirmDangerousLaunch } from "../utils/sessionActions";

export class SessionTreeViewProvider implements vscode.WebviewViewProvider {
  private webviewView: vscode.WebviewView | undefined;
  private stateListener: vscode.Disposable | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly stateManager: SessionTreeStateManager,
    private readonly terminalService: ClaudeTerminalService,
    private readonly discovery: ISessionDiscoveryService,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly onOpenPromptPreview: (node: SessionPromptNode) => void,
    private readonly onViewSession: (session: SessionNode) => Promise<void>
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext<unknown>,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    const nonce = getNonce();
    const terminalGreenUri = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "terminal-green.svg"))
      .toString();
    const terminalRedUri = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "terminal-red.svg"))
      .toString();

    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this.extensionUri,
      nonce,
      terminalGreenUri,
      terminalRedUri
    );

    // Listen for state changes and push updates to webview
    this.stateListener = this.stateManager.onDidChangeState(async () => {
      await this.postStateUpdate();
    });

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((msg: WebviewToExtensionMessage) => {
      this.handleMessage(msg).catch((err: unknown) => {
        this.outputChannel.appendLine(`[webview] Error handling message "${msg.type}": ${String(err)}`);
      });
    }, undefined);

    webviewView.onDidDispose(() => {
      this.stateListener?.dispose();
      this.webviewView = undefined;
    });

    // Send initial state
    this.postStateUpdate();
  }

  public postStartRename(sessionId: string): void {
    this.webviewView?.webview.postMessage({ type: "startRename", sessionId });
  }

  public postCancelRename(): void {
    this.webviewView?.webview.postMessage({ type: "cancelRename" });
  }

  public postFocusSearch(): void {
    this.webviewView?.webview.postMessage({ type: "focusSearch" });
  }

  private async postStateUpdate(): Promise<void> {
    if (!this.webviewView) {
      return;
    }
    const state = await this.stateManager.buildWebviewState();
    this.webviewView.webview.postMessage({ type: "updateState", state });
  }

  private async handleMessage(msg: WebviewToExtensionMessage): Promise<void> {
    switch (msg.type) {
      case "openSession": {
        const session = this.stateManager.getSessionById(msg.sessionId);
        if (session) {
          await this.terminalService.openSession(session);
        }
        break;
      }

      case "openSessionDangerously": {
        const session = this.stateManager.getSessionById(msg.sessionId);
        if (!session) {
          break;
        }
        const confirmed = await confirmDangerousLaunch(session.title);
        if (confirmed) {
          await this.terminalService.openSession(session, { dangerouslySkipPermissions: true });
        }
        break;
      }

      case "renameSession": {
        const session = this.stateManager.getSessionById(msg.sessionId);
        if (!session) {
          break;
        }
        const result = await renameSession(session.transcriptPath, session.sessionId, msg.newTitle);
        if (!result.success) {
          vscode.window.showErrorMessage(`Failed to rename session: ${result.error}`);
          this.outputChannel.appendLine(`[rename] Error renaming session ${session.sessionId}: ${result.error}`);
          break;
        }
        this.outputChannel.appendLine(`[rename] Session ${session.sessionId} renamed to "${msg.newTitle.trim()}".`);
        this.discovery.invalidateSessionCache(session.transcriptPath);
        await this.stateManager.refresh();
        break;
      }

      case "renameCancelled":
        break;

      case "deleteSession": {
        const session = this.stateManager.getSessionById(msg.sessionId);
        if (!session) {
          break;
        }
        await confirmAndDeleteSessions([session], this.discovery, this.stateManager, this.outputChannel);
        break;
      }

      case "toggleCheck":
        this.stateManager.toggleCheck(msg.sessionId);
        vscode.commands.executeCommand(
          "setContext",
          "claudeSessions.hasCheckedSessions",
          this.stateManager.hasCheckedSessions()
        );
        break;

      case "rangeCheck":
        this.stateManager.selectSessions(msg.sessionIds);
        vscode.commands.executeCommand(
          "setContext",
          "claudeSessions.hasCheckedSessions",
          this.stateManager.hasCheckedSessions()
        );
        break;

      case "toggleWorkspaceExpand":
        this.stateManager.toggleWorkspaceExpand(msg.workspaceUri);
        break;

      case "toggleSessionExpand":
        this.stateManager.toggleSessionExpand(msg.sessionId);
        break;

      case "openPromptPreview": {
        const session = this.stateManager.getSessionById(msg.sessionId);
        const prompt = this.stateManager.getPromptById(msg.sessionId, msg.promptId);
        if (!session || !prompt) {
          break;
        }
        const promptIndex = this.stateManager.getPromptIndex(msg.sessionId, msg.promptId);
        const node: SessionPromptNode = {
          kind: "sessionPrompt",
          sessionId: msg.sessionId,
          sessionTitle: session.title,
          promptId: msg.promptId,
          promptIndex: promptIndex,
          promptTitle: prompt.promptTitle,
          promptRaw: prompt.promptRaw,
          responseRaw: prompt.responseRaw,
          timestampIso: prompt.timestampIso,
          timestampMs: prompt.timestampMs
        };
        this.onOpenPromptPreview(node);
        break;
      }

      case "viewSession": {
        const session = this.stateManager.getSessionById(msg.sessionId);
        if (session) {
          await this.onViewSession(session);
        }
        break;
      }

      case "clearFilter":
        this.stateManager.setFilter(undefined, undefined);
        vscode.commands.executeCommand("setContext", "claudeSessions.filterActive", false);
        break;

      case "search": {
        const query = msg.query;
        this.outputChannel.appendLine(`[search] Starting search for query: "${query}"`);
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        const entries = await this.discovery.getSearchableEntries(workspaceFolders);
        const lowerQuery = query.toLowerCase();
        const matchingIds = new Set<string>();
        for (const entry of entries) {
          if (entry.contentText.toLowerCase().includes(lowerQuery)) {
            matchingIds.add(entry.sessionId);
          }
        }
        this.outputChannel.appendLine(
          `[search] Found ${String(matchingIds.size)} matching sessions for query: "${query}"`
        );
        this.stateManager.setFilter(query, matchingIds);
        vscode.commands.executeCommand("setContext", "claudeSessions.filterActive", true);
        break;
      }
    }
  }
}
