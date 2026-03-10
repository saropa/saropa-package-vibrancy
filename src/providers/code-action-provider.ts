import * as vscode from 'vscode';
import { findKnownIssue } from '../scoring/known-issues';

export class VibrancyCodeActionProvider implements vscode.CodeActionProvider {
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
            if (!issue?.replacement) { continue; }

            const action = new vscode.CodeAction(
                `Replace with ${issue.replacement}`,
                vscode.CodeActionKind.QuickFix,
            );
            action.diagnostics = [diag];
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(document.uri, diag.range, issue.replacement);
            actions.push(action);
        }

        return actions;
    }
}
