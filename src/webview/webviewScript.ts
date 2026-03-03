export function getWebviewScript(): string {
  return `
    (function() {
      const vscode = acquireVsCodeApi();
      let state = null;
      let focusedIndex = -1;
      let renamingSessionId = null;


      const container = document.getElementById('tree-container');
      const tooltipEl = document.getElementById('custom-tooltip');
      const searchContainer = document.querySelector('.search-container');
      const searchInput = document.getElementById('search-input');
      const searchClear = document.getElementById('search-clear');

      let searchVisible = false;

      function showSearch() {
        searchVisible = true;
        searchContainer.classList.add('visible');
        searchInput.focus();
        searchInput.select();
      }

      function hideSearch() {
        searchVisible = false;
        searchContainer.classList.remove('visible');
        searchInput.value = '';
        container.focus();
      }

      function toggleSearch() {
        if (searchVisible) {
          // Closing search — clear any active filter too
          if (state && state.filterQuery) {
            vscode.postMessage({ type: 'clearFilter' });
          }
          hideSearch();
        } else {
          showSearch();
        }
      }

      // Search input handling
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = searchInput.value.trim();
          if (query) {
            vscode.postMessage({ type: 'search', query });
          } else {
            vscode.postMessage({ type: 'clearFilter' });
            hideSearch();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          vscode.postMessage({ type: 'clearFilter' });
          hideSearch();
        }
        e.stopPropagation();
      });

      searchClear.addEventListener('click', () => {
        vscode.postMessage({ type: 'clearFilter' });
        hideSearch();
      });

      function escapeHtml(text) {
        return String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function highlightLabel(label, ranges) {
        if (!ranges || ranges.length === 0) {
          return escapeHtml(label);
        }
        let result = '';
        let lastIndex = 0;
        for (const [start, end] of ranges) {
          result += escapeHtml(label.slice(lastIndex, start));
          result += '<span class="highlight">' + escapeHtml(label.slice(start, end)) + '</span>';
          lastIndex = end;
        }
        result += escapeHtml(label.slice(lastIndex));
        return result;
      }

      function render() {
        if (!state) {
          container.innerHTML = '<div class="empty-state">Loading...</div>';
          return;
        }

        const rows = [];

        // Sync search input value with state (but don't force visibility)
        if (state.filterQuery && searchVisible && searchInput.value !== state.filterQuery) {
          searchInput.value = state.filterQuery;
        }

        if (state.workspaces.length === 0) {
          rows.push('<div class="empty-state">Open a folder to view Claude sessions.</div>');
        }

        for (const workspace of state.workspaces) {
          if (!workspace.workspaceName) {
            // Empty workspace placeholder
            if (workspace.infoMessage) {
              rows.push(
                '<div class="info-row" data-depth="0">' +
                '<span class="codicon codicon-info"></span>' +
                '<span>' + escapeHtml(workspace.infoMessage) + '</span>' +
                '</div>'
              );
            }
            continue;
          }

          const wsExpanded = state.expandedWorkspaces.includes(workspace.workspaceUri);
          rows.push(
            '<div class="tree-row" data-depth="0" data-type="workspace" data-uri="' + escapeHtml(workspace.workspaceUri) + '" title="' + escapeHtml(workspace.workspaceUri) + '">' +
            '<span class="twistie ' + (wsExpanded ? 'expanded' : 'collapsed') + '"></span>' +
            '<span class="tree-icon"><span class="codicon codicon-folder"></span></span>' +
            '<span class="tree-label">' + escapeHtml(workspace.workspaceName) + '</span>' +
            '</div>'
          );

          if (!wsExpanded) {
            continue;
          }

          if (workspace.infoMessage && workspace.sessions.length === 0) {
            rows.push(
              '<div class="info-row" data-depth="1">' +
              '<span class="codicon codicon-info"></span>' +
              '<span>' + escapeHtml(workspace.infoMessage) + '</span>' +
              '</div>'
            );
            continue;
          }

          for (const session of workspace.sessions) {
            const sessionExpanded = state.expandedSessions.includes(session.sessionId);
            const isChecked = state.checkedSessionIds.includes(session.sessionId);
            const isRenaming = renamingSessionId === session.sessionId;

            let labelHtml;
            if (isRenaming) {
              labelHtml = '<input class="rename-input" type="text" value="' + escapeHtml(session.title) + '" data-session-id="' + escapeHtml(session.sessionId) + '" />';
            } else {
              const truncated = session.title.length > 35
                ? session.title.slice(0, 32) + '...'
                : session.title;
              labelHtml = '<span class="tree-label">' + escapeHtml(truncated) + '</span>';
            }

            let checkboxHtml = '';
            if (state.selectionMode) {
              checkboxHtml = '<span class="tree-checkbox ' + (isChecked ? 'checked' : '') + '" data-action="toggleCheck" data-session-id="' + escapeHtml(session.sessionId) + '"></span>';
            }

            const hoverActions = isRenaming ? '' :
              '<span class="hover-actions">' +
              '<button class="action-btn" data-action="openSession" data-session-id="' + escapeHtml(session.sessionId) + '" title="Open Session"><img src="' + (container.dataset.terminalGreenUri || '') + '" /></button>' +
              '<button class="action-btn" data-action="openSessionDangerously" data-session-id="' + escapeHtml(session.sessionId) + '" title="Open Session (Skip Permissions)"><img src="' + (container.dataset.terminalRedUri || '') + '" /></button>' +
              '<button class="action-btn" data-action="startRename" data-session-id="' + escapeHtml(session.sessionId) + '" title="Rename"><span class="codicon codicon-edit"></span></button>' +
              '<button class="action-btn" data-action="deleteSession" data-session-id="' + escapeHtml(session.sessionId) + '" title="Delete"><span class="codicon codicon-trash"></span></button>' +
              '</span>';

            rows.push(
              '<div class="tree-row' + (focusedIndex === rows.length ? ' focused' : '') + '" ' +
              'data-depth="1" data-type="session" data-session-id="' + escapeHtml(session.sessionId) + '" ' +
              'data-tooltip="' + escapeHtml(session.tooltip) + '">' +
              '<span class="twistie ' + (sessionExpanded ? 'expanded' : 'collapsed') + '"></span>' +
              checkboxHtml +
              labelHtml +
              (isRenaming ? '' : '<span class="tree-description">' + escapeHtml(session.description) + '</span>') +
              hoverActions +
              '</div>'
            );

            if (sessionExpanded && session.prompts) {
              for (const prompt of session.prompts) {
                const matchIndicator = prompt.matchType
                  ? '<span class="match-indicator"></span>'
                  : '';

                let descriptionHtml = '';
                if (prompt.matchType === 'prompt') {
                  descriptionHtml = '<span class="tree-description">match in prompt</span>';
                } else if (prompt.matchType === 'response') {
                  descriptionHtml = '<span class="tree-description">match in response</span>';
                }

                const promptLabel = highlightLabel(prompt.promptTitle, prompt.highlightRanges);

                const promptTooltip = (prompt.promptRaw || '').slice(0, 300) +
                  (prompt.promptRaw && prompt.promptRaw.length > 300 ? '...' : '');

                rows.push(
                  '<div class="tree-row" data-depth="2" data-type="prompt" ' +
                  'data-prompt-id="' + escapeHtml(prompt.promptId) + '" ' +
                  'data-session-id="' + escapeHtml(prompt.sessionId) + '" ' +
                  'data-tooltip="' + escapeHtml(promptTooltip) + '"' +
                  '>' +
                  '<span class="twistie leaf"></span>' +
                  matchIndicator +
                  '<span class="tree-icon"><span class="codicon codicon-book"></span></span>' +
                  '<span class="tree-label">' + promptLabel + '</span>' +
                  descriptionHtml +
                  '</div>'
                );
              }
            }
          }
        }

        container.innerHTML = rows.join('');

        // Focus rename input if renaming
        if (renamingSessionId) {
          const input = container.querySelector('.rename-input');
          if (input) {
            input.focus();
            input.select();
          }
        }

        updateFocusVisual();
      }

      function updateFocusVisual() {
        const allRows = container.querySelectorAll('.tree-row');
        allRows.forEach((row, i) => {
          row.classList.toggle('focused', i === focusedIndex);
        });
      }

      function getClickableRows() {
        return Array.from(container.querySelectorAll('.tree-row'));
      }

      // Handle clicks
      container.addEventListener('click', (e) => {
        const target = e.target;

        // Action buttons
        const actionBtn = target.closest('[data-action]');
        if (actionBtn) {
          const action = actionBtn.dataset.action;
          const sessionId = actionBtn.dataset.sessionId;

          if (action === 'openSession') {
            vscode.postMessage({ type: 'openSession', sessionId });
            return;
          }
          if (action === 'openSessionDangerously') {
            vscode.postMessage({ type: 'openSessionDangerously', sessionId });
            return;
          }
          if (action === 'startRename') {
            renamingSessionId = sessionId;
            render();
            return;
          }
          if (action === 'deleteSession') {
            vscode.postMessage({ type: 'deleteSession', sessionId });
            return;
          }
          if (action === 'toggleCheck') {
            vscode.postMessage({ type: 'toggleCheck', sessionId });
            return;
          }
        }

        // Row clicks
        const row = target.closest('.tree-row');
        if (!row) return;

        const type = row.dataset.type;
        const allRows = getClickableRows();
        focusedIndex = allRows.indexOf(row);

        if (type === 'workspace') {
          vscode.postMessage({ type: 'toggleWorkspaceExpand', workspaceUri: row.dataset.uri });
        } else if (type === 'session') {
          if (state && state.selectionMode) {
            vscode.postMessage({ type: 'toggleCheck', sessionId: row.dataset.sessionId });
          } else {
            // Click on twistie toggles expand, else open session
            if (target.closest('.twistie')) {
              vscode.postMessage({ type: 'toggleSessionExpand', sessionId: row.dataset.sessionId });
            } else {
              vscode.postMessage({ type: 'openSession', sessionId: row.dataset.sessionId });
            }
          }
        } else if (type === 'prompt') {
          vscode.postMessage({
            type: 'openPromptPreview',
            sessionId: row.dataset.sessionId,
            promptId: row.dataset.promptId
          });
        }
      });

      // Handle rename input events
      container.addEventListener('keydown', (e) => {
        if (e.target.classList && e.target.classList.contains('rename-input')) {
          if (e.key === 'Enter') {
            e.preventDefault();
            const newTitle = e.target.value.trim();
            const sessionId = e.target.dataset.sessionId;
            if (newTitle) {
              vscode.postMessage({ type: 'renameSession', sessionId, newTitle });
            } else {
              vscode.postMessage({ type: 'renameCancelled' });
            }
            renamingSessionId = null;
            render();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            renamingSessionId = null;
            vscode.postMessage({ type: 'renameCancelled' });
            render();
            return;
          }
          // Don't propagate other keys from rename input to tree navigation
          e.stopPropagation();
          return;
        }
      });

      container.addEventListener('blur', (e) => {
        if (e.target.classList && e.target.classList.contains('rename-input')) {
          const newTitle = e.target.value.trim();
          const sessionId = e.target.dataset.sessionId;
          if (newTitle && renamingSessionId) {
            vscode.postMessage({ type: 'renameSession', sessionId, newTitle });
          } else {
            vscode.postMessage({ type: 'renameCancelled' });
          }
          renamingSessionId = null;
          render();
        }
      }, true);

      // Keyboard navigation
      container.addEventListener('keydown', (e) => {
        // Skip if we're in a rename input
        if (e.target.classList && e.target.classList.contains('rename-input')) {
          return;
        }

        const allRows = getClickableRows();
        if (allRows.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusedIndex = Math.min(focusedIndex + 1, allRows.length - 1);
          updateFocusVisual();
          allRows[focusedIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusedIndex = Math.max(focusedIndex - 1, 0);
          updateFocusVisual();
          allRows[focusedIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          const row = allRows[focusedIndex];
          if (row) {
            const type = row.dataset.type;
            if (type === 'workspace') {
              const uri = row.dataset.uri;
              if (!state.expandedWorkspaces.includes(uri)) {
                vscode.postMessage({ type: 'toggleWorkspaceExpand', workspaceUri: uri });
              }
            } else if (type === 'session') {
              const sessionId = row.dataset.sessionId;
              if (!state.expandedSessions.includes(sessionId)) {
                vscode.postMessage({ type: 'toggleSessionExpand', sessionId });
              }
            }
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const row = allRows[focusedIndex];
          if (row) {
            const type = row.dataset.type;
            if (type === 'workspace') {
              const uri = row.dataset.uri;
              if (state.expandedWorkspaces.includes(uri)) {
                vscode.postMessage({ type: 'toggleWorkspaceExpand', workspaceUri: uri });
              }
            } else if (type === 'session') {
              const sessionId = row.dataset.sessionId;
              if (state.expandedSessions.includes(sessionId)) {
                vscode.postMessage({ type: 'toggleSessionExpand', sessionId });
              }
            }
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const row = allRows[focusedIndex];
          if (row) {
            const type = row.dataset.type;
            if (type === 'workspace') {
              vscode.postMessage({ type: 'toggleWorkspaceExpand', workspaceUri: row.dataset.uri });
            } else if (type === 'session') {
              vscode.postMessage({ type: 'openSession', sessionId: row.dataset.sessionId });
            } else if (type === 'prompt') {
              vscode.postMessage({
                type: 'openPromptPreview',
                sessionId: row.dataset.sessionId,
                promptId: row.dataset.promptId
              });
            }
          }
        } else if (e.key === ' ') {
          e.preventDefault();
          const row = allRows[focusedIndex];
          if (row && row.dataset.type === 'session' && state && state.selectionMode) {
            vscode.postMessage({ type: 'toggleCheck', sessionId: row.dataset.sessionId });
          }
        } else if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) {
          e.preventDefault();
          const row = allRows[focusedIndex];
          if (row && row.dataset.type === 'session') {
            vscode.postMessage({ type: 'deleteSession', sessionId: row.dataset.sessionId });
          }
        } else if (e.key === 'F2') {
          e.preventDefault();
          const row = allRows[focusedIndex];
          if (row && row.dataset.type === 'session') {
            renamingSessionId = row.dataset.sessionId;
            render();
          }
        } else if (e.key === 'Escape') {
          if (renamingSessionId) {
            renamingSessionId = null;
            vscode.postMessage({ type: 'renameCancelled' });
            render();
          }
        }
      });

      // Handle messages from extension
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'updateState') {
          state = msg.state;
          // Preserve focus index within bounds
          const allRowCount = container.querySelectorAll('.tree-row').length;
          if (focusedIndex >= allRowCount) {
            focusedIndex = Math.max(allRowCount - 1, 0);
          }
          render();
        } else if (msg.type === 'startRename') {
          renamingSessionId = msg.sessionId;
          render();
        } else if (msg.type === 'cancelRename') {
          renamingSessionId = null;
          render();
        } else if (msg.type === 'focusSearch') {
          toggleSearch();
        }
      });

      // Custom tooltip for prompt rows
      let tooltipTimeout = null;
      container.addEventListener('mouseenter', (e) => {
        const row = e.target.closest('[data-tooltip]');
        if (!row) return;
        const text = row.dataset.tooltip;
        if (!text) return;
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => {
          tooltipEl.textContent = text;
          const rect = row.getBoundingClientRect();
          tooltipEl.style.left = (rect.left + 16) + 'px';
          tooltipEl.style.top = (rect.bottom + 4) + 'px';
          tooltipEl.classList.add('visible');
        }, 400);
      }, true);

      container.addEventListener('mouseleave', (e) => {
        const row = e.target.closest('[data-tooltip]');
        if (!row) return;
        clearTimeout(tooltipTimeout);
        tooltipEl.classList.remove('visible');
      }, true);

      container.addEventListener('mousemove', (e) => {
        const row = e.target.closest('[data-tooltip]');
        if (!row) {
          clearTimeout(tooltipTimeout);
          tooltipEl.classList.remove('visible');
        }
      }, true);

      // Suppress default browser context menu
      container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      // Initial focus
      container.setAttribute('tabindex', '0');
      container.focus();
    })();
  `;
}
