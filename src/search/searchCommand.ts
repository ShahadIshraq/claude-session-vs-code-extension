import * as vscode from "vscode";

export function registerSearchCommands(
  context: vscode.ExtensionContext,
  onFocusSearch: () => void,
  onClearFilter: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.search", () => {
      onFocusSearch();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.clearFilter", () => {
      onClearFilter();
    })
  );
}
