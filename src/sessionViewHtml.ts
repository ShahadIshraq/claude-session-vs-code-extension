import { SessionNode } from "./models";
import { SessionPrompt } from "./discovery/types";
import { escapeHtml } from "./extension";

export function buildSessionViewHtml(session: SessionNode, prompts: SessionPrompt[]): string {
  const formattedDate = new Date(session.updatedAt).toLocaleString();

  const conversationHtml = prompts
    .map((prompt) => {
      const ts = prompt.timestampIso ? new Date(prompt.timestampIso).toLocaleString() : "";
      const userBlock = `<div class="message user-message">
      <div class="message-header"><span class="role-label user-role">User</span><span class="timestamp">${escapeHtml(ts)}</span></div>
      <pre class="message-body">${escapeHtml(prompt.promptRaw)}</pre>
    </div>`;

      const assistantBlock = prompt.responseRaw
        ? `<div class="message assistant-message">
          <div class="message-header"><span class="role-label assistant-role">Assistant</span></div>
          <pre class="message-body">${escapeHtml(prompt.responseRaw)}</pre>
        </div>`
        : "";

      return userBlock + assistantBlock;
    })
    .join("\n");

  const emptyMsg = prompts.length === 0 ? '<div class="empty-state">No prompts found in this session.</div>' : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 16px 24px;
    line-height: 1.6;
    margin: 0;
  }
  .session-header {
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .session-header h1 {
    font-size: 1.3em;
    margin: 0 0 6px 0;
  }
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
  .message {
    margin-bottom: 20px;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }
  .message-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    font-size: 0.85em;
    background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.1));
  }
  .role-label {
    font-weight: 600;
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .user-role {
    background: var(--vscode-badge-background, rgba(0,122,204,0.2));
    color: var(--vscode-badge-foreground, var(--vscode-editor-foreground));
  }
  .assistant-role {
    background: var(--vscode-testing-iconPassed, rgba(40,167,69,0.2));
    color: var(--vscode-editor-foreground);
  }
  .timestamp {
    color: var(--vscode-descriptionForeground);
  }
  .message-body {
    margin: 0;
    padding: 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    background: transparent;
    overflow-x: auto;
  }
  .empty-state {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    padding: 20px 0;
  }
</style>
</head>
<body>
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
  ${conversationHtml}
</body>
</html>`;
}
