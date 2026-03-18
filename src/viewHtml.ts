import MarkdownIt from "markdown-it";

export const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.disable(["image"]);

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatTimestamp(timestampMs: number | undefined, timestampIso: string | undefined): string {
  if (timestampMs !== undefined) {
    return new Date(timestampMs).toLocaleString();
  }
  if (timestampIso !== undefined) {
    const parsed = Date.parse(timestampIso);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toLocaleString();
    }
  }
  return "";
}

export const sharedStyles = `
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 16px 24px;
    line-height: 1.6;
    margin: 0;
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
  .timestamp { color: var(--vscode-descriptionForeground); }
  .message-body { padding: 12px 16px; background: transparent; }
  .markdown-body { font-size: 0.95em; line-height: 1.65; }
  .markdown-body > *:first-child { margin-top: 0; }
  .markdown-body > *:last-child { margin-bottom: 0; }
  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3,
  .markdown-body h4,
  .markdown-body h5,
  .markdown-body h6 {
    margin: 1em 0 0.4em; font-weight: 600; line-height: 1.3;
  }
  .markdown-body h1 { font-size: 1.4em; }
  .markdown-body h2 { font-size: 1.2em; }
  .markdown-body h3 { font-size: 1.05em; }
  .markdown-body p { margin: 0.5em 0; }
  .markdown-body ul, .markdown-body ol { margin: 0.4em 0; padding-left: 1.6em; }
  .markdown-body li { margin: 0.2em 0; }
  .markdown-body code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
    padding: 1px 5px;
    border-radius: 3px;
  }
  .markdown-body pre {
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12));
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-radius: 4px;
    padding: 10px 14px;
    overflow-x: auto;
    margin: 0.6em 0;
  }
  .markdown-body pre code { background: transparent; padding: 0; border-radius: 0; font-size: 0.9em; white-space: pre; }
  .markdown-body blockquote {
    margin: 0.5em 0;
    padding: 4px 12px;
    border-left: 3px solid var(--vscode-textBlockQuote-border, rgba(128,128,128,0.4));
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.05));
    color: var(--vscode-descriptionForeground);
  }
  .markdown-body table { border-collapse: collapse; margin: 0.6em 0; font-size: 0.9em; width: 100%; }
  .markdown-body th, .markdown-body td {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    padding: 5px 10px;
    text-align: left;
  }
  .markdown-body th {
    background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.1));
    font-weight: 600;
  }
  .markdown-body a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  .markdown-body hr { border: none; border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3)); margin: 1em 0; }
`;

function generateNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function htmlDocument(extraStyles: string, body: string): string {
  const nonce = generateNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">
${sharedStyles}
${extraStyles}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function renderMessageBlock(role: "user" | "assistant", renderedBodyHtml: string, headerExtra = ""): string {
  const roleClass = role === "user" ? "user-role" : "assistant-role";
  const roleLabel = role === "user" ? "User" : "Assistant";
  return `<div class="message ${role}-message">
    <div class="message-header"><span class="role-label ${roleClass}">${roleLabel}</span>${headerExtra}</div>
    <div class="message-body markdown-body">${renderedBodyHtml}</div>
  </div>`;
}
