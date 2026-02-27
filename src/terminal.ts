import { execFile } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import { SessionNode } from "./models";

const execFileAsync = promisify(execFile);

export interface OpenSessionOptions {
  readonly dangerouslySkipPermissions?: boolean;
}

export class ClaudeTerminalService {
  public constructor(private readonly outputChannel: vscode.OutputChannel) {}

  public async openSession(session: SessionNode, options: OpenSessionOptions = {}): Promise<void> {
    const hasClaude = await this.hasClaudeBinary();
    if (!hasClaude) {
      vscode.window.showErrorMessage("Could not find `claude` in PATH. Install Claude Code CLI to resume sessions.");
      this.outputChannel.appendLine("[terminal] `claude` executable not found in PATH.");
      return;
    }

    const terminal = vscode.window.createTerminal({
      name: session.title,
      cwd: session.cwd,
      location: {
        viewColumn: vscode.ViewColumn.Active
      }
    });

    const command = buildClaudeResumeCommand(session.sessionId, options.dangerouslySkipPermissions === true);
    this.outputChannel.appendLine(
      `[terminal] Launching session ${session.sessionId} (skipPermissions=${String(options.dangerouslySkipPermissions === true)}).`
    );
    terminal.sendText(command, true);
    terminal.show(true);
  }

  private async hasClaudeBinary(): Promise<boolean> {
    const checker = process.platform === "win32" ? "where" : "which";

    try {
      await execFileAsync(checker, ["claude"]);
      return true;
    } catch {
      return false;
    }
  }
}

export function buildClaudeResumeCommand(sessionId: string, dangerouslySkipPermissions: boolean): string {
  const args = ["claude"];
  if (dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  args.push("--resume", shellQuote(sessionId));
  return args.join(" ");
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
