import * as path from "path";
import * as vscode from "vscode";
import { ISessionDiscoveryService, SearchableEntry } from "../discovery/types";
import { formatAgeToken } from "../treeProvider";

const MAX_RESULTS = 50;
const DEBOUNCE_MS = 250;
const SNIPPET_CONTEXT_CHARS = 40;
const MIN_QUERY_LENGTH = 2;

export function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(text.length, matchIndex + matchLength + SNIPPET_CONTEXT_CHARS);

  let snippet = text
    .slice(start, end)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ");

  if (start > 0) {
    snippet = "..." + snippet;
  }
  if (end < text.length) {
    snippet = snippet + "...";
  }

  return snippet;
}

export function registerSearchCommand(
  context: vscode.ExtensionContext,
  discovery: ISessionDiscoveryService,
  outputChannel: vscode.OutputChannel
): void {
  const disposable = vscode.commands.registerCommand("claudeSessions.search", () => {
    const quickPick = vscode.window.createQuickPick();
    quickPick.placeholder = "Search across all session contents...";
    quickPick.matchOnDescription = false;
    quickPick.matchOnDetail = false;

    let cachedEntries: SearchableEntry[] | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const loadEntries = async (): Promise<void> => {
      quickPick.busy = true;
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        cachedEntries = await discovery.getSearchableEntries(workspaceFolders);
        outputChannel.appendLine(`[search] loaded ${String(cachedEntries.length)} searchable entries`);
      } catch (error) {
        outputChannel.appendLine(`[search] failed to load entries: ${String(error)}`);
        cachedEntries = [];
      } finally {
        quickPick.busy = false;
      }

      // Trigger a search with the current value after entries are loaded
      if (quickPick.value.length >= MIN_QUERY_LENGTH) {
        performSearch(quickPick.value);
      }
    };

    const performSearch = (query: string): void => {
      if (!cachedEntries) {
        return;
      }

      if (query.length < MIN_QUERY_LENGTH) {
        quickPick.items = [];
        return;
      }

      const lowerQuery = query.toLowerCase();
      const matched: Array<{ entry: SearchableEntry; matchIndex: number }> = [];

      for (const entry of cachedEntries) {
        const lowerContent = entry.contentText.toLowerCase();
        const idx = lowerContent.indexOf(lowerQuery);
        if (idx !== -1) {
          matched.push({ entry, matchIndex: idx });
        }
      }

      matched.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
      const limited = matched.slice(0, MAX_RESULTS);

      quickPick.items = limited.map(({ entry, matchIndex }) => {
        const workspaceFolderName = path.basename(entry.cwd);
        const age = formatAgeToken(entry.updatedAt);
        const snippet = extractSnippet(entry.contentText, matchIndex, query.length);

        return {
          label: `$(comment-discussion) ${entry.title}`,
          description: `${workspaceFolderName} · ${age}`,
          detail: snippet
        };
      });
    };

    quickPick.onDidChangeValue((value) => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }

      if (value.length < MIN_QUERY_LENGTH) {
        quickPick.items = [];
        return;
      }

      debounceTimer = setTimeout(() => {
        performSearch(value);
      }, DEBOUNCE_MS);
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (!selected || !cachedEntries) {
        quickPick.dispose();
        return;
      }

      // Find the matching entry by correlating the label
      const selectedLabel = selected.label;
      const entry = cachedEntries.find((e) => `$(comment-discussion) ${e.title}` === selectedLabel);

      if (!entry) {
        outputChannel.appendLine(`[search] could not find entry for label: ${selectedLabel}`);
        quickPick.dispose();
        return;
      }

      const sessionNode = {
        kind: "session" as const,
        sessionId: entry.sessionId,
        cwd: entry.cwd,
        transcriptPath: entry.transcriptPath,
        title: entry.title,
        updatedAt: entry.updatedAt
      };

      void vscode.commands.executeCommand("claudeSessions.openSession", sessionNode);
      quickPick.dispose();
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
    });

    quickPick.show();
    void loadEntries();
  });

  context.subscriptions.push(disposable);
}
