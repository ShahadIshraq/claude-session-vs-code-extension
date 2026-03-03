export function getWebviewStyles(): string {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      overflow-x: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    .tree-container {
      width: 100%;
      outline: none;
    }

    .tree-row {
      display: flex;
      align-items: center;
      height: 22px;
      padding: 0 8px 0 0;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      position: relative;
    }

    .tree-row:hover {
      background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.1));
    }

    .tree-row.focused {
      background: var(--vscode-list-focusBackground, var(--vscode-list-hoverBackground));
      outline: 1px solid var(--vscode-focusBorder, transparent);
      outline-offset: -1px;
    }

    .tree-row.selected {
      background: var(--vscode-list-activeSelectionBackground, #094771);
      color: var(--vscode-list-activeSelectionForeground, #fff);
    }

    /* Indent levels */
    .tree-row[data-depth="0"] { padding-left: 8px; }
    .tree-row[data-depth="1"] { padding-left: 24px; }
    .tree-row[data-depth="2"] { padding-left: 40px; }

    .twistie {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 22px;
      flex-shrink: 0;
      font-size: 12px;
    }

    .twistie.collapsed::before {
      content: '';
      display: inline-block;
      width: 0;
      height: 0;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      border-left: 5px solid var(--vscode-foreground);
      opacity: 0.8;
    }

    .twistie.expanded::before {
      content: '';
      display: inline-block;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid var(--vscode-foreground);
      opacity: 0.8;
    }

    .twistie.leaf {
      visibility: hidden;
    }

    .tree-checkbox {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-right: 4px;
      flex-shrink: 0;
      border: 1px solid var(--vscode-checkbox-border, var(--vscode-foreground));
      border-radius: 3px;
      background: var(--vscode-checkbox-background, transparent);
      cursor: pointer;
    }

    .tree-checkbox.checked {
      background: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
      border-color: var(--vscode-checkbox-selectBorder, var(--vscode-focusBorder));
    }

    .tree-checkbox.checked::after {
      content: '✓';
      color: var(--vscode-checkbox-foreground, #fff);
      font-size: 11px;
      font-weight: bold;
    }

    .tree-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-right: 4px;
      flex-shrink: 0;
    }

    .tree-icon .codicon {
      font-size: 16px;
    }

    .tree-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 22px;
    }

    .tree-description {
      margin-left: 6px;
      opacity: 0.7;
      font-size: 0.9em;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .hover-actions {
      display: none;
      align-items: center;
      gap: 2px;
      margin-left: auto;
      flex-shrink: 0;
      padding-left: 8px;
    }

    .tree-row:hover .hover-actions {
      display: flex;
    }

    .tree-row:hover .tree-description {
      display: none;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-radius: 3px;
      padding: 0;
      opacity: 0.7;
    }

    .action-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2));
    }

    .action-btn img {
      width: 16px;
      height: 16px;
    }

    .rename-input {
      flex: 1;
      height: 18px;
      line-height: 18px;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-input-foreground, var(--vscode-foreground));
      background: var(--vscode-input-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-focusBorder, #007acc);
      outline: none;
      padding: 0 4px;
      border-radius: 2px;
      margin: 0;
    }

    .highlight {
      background: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33));
      border-radius: 2px;
    }

    .match-indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-list-highlightForeground, #0097fb);
      margin-right: 4px;
      flex-shrink: 0;
    }

    .info-row {
      display: flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      opacity: 0.7;
      font-style: italic;
    }

    .info-row .codicon {
      margin-right: 4px;
    }

    .search-container {
      display: none;
      align-items: center;
      padding: 4px 8px;
      gap: 4px;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border, transparent));
    }

    .search-container.visible {
      display: flex;
    }

    .search-container .search-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      opacity: 0.7;
    }

    .search-input {
      flex: 1;
      height: 22px;
      line-height: 22px;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-input-foreground, var(--vscode-foreground));
      background: var(--vscode-input-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-input-border, transparent);
      outline: none;
      padding: 0 4px;
      border-radius: 2px;
      margin: 0;
    }

    .search-input:focus {
      border-color: var(--vscode-focusBorder, #007acc);
    }

    .search-input::placeholder {
      color: var(--vscode-input-placeholderForeground, rgba(128, 128, 128, 0.7));
    }

    .search-clear {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-radius: 3px;
      padding: 0;
      opacity: 0.7;
    }

    .search-clear:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2));
    }

    .filter-row {
      display: flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      background: var(--vscode-badge-background, rgba(128, 128, 128, 0.2));
      margin-bottom: 2px;
    }

    .filter-row .codicon {
      margin-right: 4px;
    }

    .filter-row .clear-filter {
      margin-left: auto;
      cursor: pointer;
      opacity: 0.7;
    }

    .filter-row .clear-filter:hover {
      opacity: 1;
    }

    .empty-state {
      padding: 16px;
      text-align: center;
      opacity: 0.7;
    }

    .custom-tooltip {
      display: none;
      position: fixed;
      max-width: 400px;
      max-height: 200px;
      padding: 4px 8px;
      font-size: var(--vscode-font-size, 13px);
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
      background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border, rgba(128,128,128,0.35)));
      border-radius: 3px;
      z-index: 1000;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: hidden;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      line-height: 1.4;
    }

    .custom-tooltip.visible {
      display: block;
    }
  `;
}
