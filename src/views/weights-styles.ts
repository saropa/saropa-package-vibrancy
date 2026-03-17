/** CSS for the scoring weights webview, using VS Code theme variables. */
export function getWeightsStyles(): string {
    return `
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 16px;
            margin: 0;
        }
        h1 { font-size: 1.4em; margin-bottom: 4px; }
        .subtitle { font-size: 0.85em; opacity: 0.7; margin-bottom: 16px; }

        .controls {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px; padding: 16px;
            margin-bottom: 16px;
        }
        .slider-row {
            display: flex; align-items: center; gap: 12px;
            margin-bottom: 10px;
        }
        .slider-label {
            min-width: 160px; font-size: 0.9em;
        }
        .slider-input {
            flex: 1; height: 6px;
            -webkit-appearance: none; appearance: none;
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 3px; outline: none;
        }
        .slider-input::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 16px; height: 16px; border-radius: 50%;
            background: var(--vscode-button-background);
            cursor: pointer;
        }
        .slider-value {
            min-width: 36px; text-align: right;
            font-variant-numeric: tabular-nums;
        }

        .controls-footer {
            display: flex; align-items: center; gap: 12px;
            margin-top: 12px; padding-top: 10px;
            border-top: 1px solid var(--vscode-widget-border);
        }
        .sum-indicator { font-size: 0.85em; flex: 1; transition: color 0.2s ease; }
        .sum-ok { color: var(--vscode-testing-iconPassed); }
        .sum-warn { color: var(--vscode-editorWarning-foreground); }

        button {
            padding: 4px 12px; border: none; border-radius: 3px;
            cursor: pointer; font-size: 0.85em;
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        table {
            width: 100%; border-collapse: collapse; margin-top: 8px;
        }
        th, td {
            text-align: left; padding: 6px 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        th {
            cursor: pointer; user-select: none;
            background: var(--vscode-editor-inactiveSelectionBackground);
        }
        th:hover { background: var(--vscode-list-hoverBackground); }
        tr:hover { background: var(--vscode-list-hoverBackground); }

        .sort-arrow { margin-left: 4px; opacity: 0.6; }
        .score-cell { font-variant-numeric: tabular-nums; }
        .delta-positive { color: var(--vscode-testing-iconPassed); font-size: 0.85em; }
        .delta-negative { color: var(--vscode-editorError-foreground); font-size: 0.85em; }
        .delta-zero { opacity: 0.5; font-size: 0.85em; }

        .category-badge {
            display: inline-block; padding: 1px 6px;
            border-radius: 3px; font-size: 0.8em;
            transition: background-color 0.2s ease;
        }
        .cat-vibrant {
            background: var(--vscode-testing-iconPassed); color: #fff;
        }
        .cat-quiet {
            background: var(--vscode-editorInfo-foreground); color: #fff;
        }
        .cat-legacy-locked {
            background: var(--vscode-editorWarning-foreground); color: #fff;
        }
        .cat-end-of-life {
            background: var(--vscode-editorError-foreground); color: #fff;
        }
        .empty-state {
            text-align: center; padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    `;
}
