import * as vscode from 'vscode';
import { VibrancyResult, AlternativeSuggestion } from '../types';
import { findKnownIssue } from '../scoring/known-issues';

export class VibrancyCodeActionProvider implements vscode.CodeActionProvider {
    private _results = new Map<string, VibrancyResult>();

    updateResults(results: VibrancyResult[]): void {
        this._results.clear();
        for (const r of results) {
            this._results.set(r.package.name, r);
        }
    }

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diag of context.diagnostics) {
            if (diag.source !== 'Saropa Package Vibrancy') { continue; }

            const packageName = document.getText(diag.range);
            const issue = findKnownIssue(packageName);

            if (issue?.replacement) {
                const action = new vscode.CodeAction(
                    `Replace with ${issue.replacement}`,
                    vscode.CodeActionKind.QuickFix,
                );
                action.diagnostics = [diag];
                action.edit = new vscode.WorkspaceEdit();
                action.edit.replace(document.uri, diag.range, issue.replacement);
                action.isPreferred = true;
                actions.push(action);
            }

            const result = this._results.get(packageName);
            if (result?.alternatives?.length) {
                for (const alt of result.alternatives) {
                    if (alt.source === 'curated' && alt.name === issue?.replacement) {
                        continue;
                    }
                    actions.push(
                        this.createAlternativeAction(document, diag, alt),
                    );
                }
            }
        }

        return actions;
    }

    private createAlternativeAction(
        document: vscode.TextDocument,
        diag: vscode.Diagnostic,
        alt: AlternativeSuggestion,
    ): vscode.CodeAction {
        const label = alt.source === 'curated'
            ? `Replace with ${alt.name} (recommended)`
            : `Replace with ${alt.name} (similar)`;

        const action = new vscode.CodeAction(
            label,
            vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = [diag];
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, diag.range, alt.name);
        return action;
    }
}
