import * as vscode from "vscode";
import { getWebviewStyles } from "./webviewStyles";
import { getWebviewScript } from "./webviewScript";

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
  terminalGreenUri: string,
  terminalRedUri: string
): string {
  const codiconsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "node_modules", "@vscode/codicons", "dist", "codicon.css")
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; object-src 'none';">
  <link href="${codiconsUri}" rel="stylesheet" />
  <style nonce="${nonce}">
    ${getWebviewStyles()}
  </style>
</head>
<body>
  <div class="search-container">
    <span class="search-icon codicon codicon-search"></span>
    <input id="search-input" class="search-input" type="text" placeholder="Search sessions..." />
    <button id="search-clear" class="search-clear" title="Close search"><span class="codicon codicon-close"></span></button>
  </div>
  <div id="tree-container" class="tree-container"
    data-terminal-green-uri="${terminalGreenUri}"
    data-terminal-red-uri="${terminalRedUri}">
  </div>
  <div id="custom-tooltip" class="custom-tooltip"></div>
  <script nonce="${nonce}">
    ${getWebviewScript()}
  </script>
</body>
</html>`;
}

export function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
