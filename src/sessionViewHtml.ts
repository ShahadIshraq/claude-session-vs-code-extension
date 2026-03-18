import { SessionNode } from "./models";
import { SessionPrompt } from "./discovery/types";
import { md, htmlDocument, renderMessageBlock, escapeHtml, formatTimestamp } from "./viewHtml";

export function buildSessionViewHtml(session: SessionNode, prompts: SessionPrompt[]): string {
  const formattedDate = new Date(session.updatedAt).toLocaleString();

  const conversationHtml = prompts
    .map((prompt) => {
      const ts = formatTimestamp(prompt.timestampMs, prompt.timestampIso);
      const userBlock = renderMessageBlock(
        "user",
        md.render(prompt.promptRaw),
        `<span class="timestamp">${escapeHtml(ts)}</span>`
      );
      const assistantBlock = prompt.responseRaw ? renderMessageBlock("assistant", md.render(prompt.responseRaw)) : "";
      return userBlock + assistantBlock;
    })
    .join("\n");

  const emptyMsg = prompts.length === 0 ? '<div class="empty-state">No prompts found in this session.</div>' : "";

  const extraStyles = `
  .session-header {
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .session-header h1 { font-size: 1.3em; margin: 0 0 6px 0; }
  .session-meta {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .session-meta code {
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.95em;
  }
  .empty-state {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    padding: 20px 0;
  }`;

  const body = `
  <div class="session-header">
    <h1>${escapeHtml(session.title)}</h1>
    <div class="session-meta">
      <span>ID: <code>${escapeHtml(session.sessionId)}</code></span>
      <span>Updated: ${escapeHtml(formattedDate)}</span>
      <span>Prompts: ${String(prompts.length)}</span>
      <span>Directory: <code>${escapeHtml(session.cwd)}</code></span>
    </div>
  </div>
  ${emptyMsg}
  ${conversationHtml}`;

  return htmlDocument(extraStyles, body);
}
