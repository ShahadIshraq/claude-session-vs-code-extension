import * as vscode from "vscode";
import { ISessionDiscoveryService } from "../discovery/types";
import { ClaudeSessionsTreeDataProvider } from "../treeProvider";

export function registerSearchCommands(
  context: vscode.ExtensionContext,
  discovery: ISessionDiscoveryService,
  treeProvider: ClaudeSessionsTreeDataProvider,
  _outputChannel: vscode.OutputChannel,
  treeViews: { explorer: vscode.TreeView<any>; sidebar: vscode.TreeView<any> }
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.search", async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Search session contents",
        placeHolder: "Enter search keywords...",
        value: treeProvider.getFilterQuery()
      });

      if (query === undefined) {
        return;
      }

      if (query === "") {
        treeProvider.setFilter(undefined, undefined);
        await vscode.commands.executeCommand("setContext", "claudeSessions.filterActive", false);
        treeViews.explorer.message = undefined;
        treeViews.sidebar.message = undefined;
        return;
      }

      treeViews.explorer.message = `Searching for "${query}"...`;
      treeViews.sidebar.message = `Searching for "${query}"...`;

      let matchCount = 0;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Searching sessions..."
        },
        async () => {
          const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
          const entries = await discovery.getSearchableEntries(workspaceFolders);
          const lowerQuery = query.toLowerCase();
          const matchingIds = new Set<string>();

          for (const entry of entries) {
            if (entry.contentText.toLowerCase().includes(lowerQuery)) {
              matchingIds.add(entry.sessionId);
            }
          }

          matchCount = matchingIds.size;
          treeProvider.setFilter(query, matchingIds);
        }
      );

      await vscode.commands.executeCommand("setContext", "claudeSessions.filterActive", true);
      treeViews.explorer.message = `Filter: "${query}"`;
      treeViews.sidebar.message = `Filter: "${query}"`;
      vscode.window.showInformationMessage(`Found ${String(matchCount)} matching sessions`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeSessions.clearFilter", async () => {
      treeProvider.setFilter(undefined, undefined);
      await vscode.commands.executeCommand("setContext", "claudeSessions.filterActive", false);
      treeViews.explorer.message = undefined;
      treeViews.sidebar.message = undefined;
    })
  );
}
