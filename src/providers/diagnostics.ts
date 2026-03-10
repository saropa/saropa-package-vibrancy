import * as vscode from 'vscode';
import { VibrancyResult } from '../types';
import { findPackageRange } from '../services/pubspec-parser';
import { categoryToSeverity, categoryLabel } from '../scoring/status-classifier';

const SEVERITY_MAP: Record<number, vscode.DiagnosticSeverity> = {
    0: vscode.DiagnosticSeverity.Error,
    1: vscode.DiagnosticSeverity.Warning,
    2: vscode.DiagnosticSeverity.Information,
    3: vscode.DiagnosticSeverity.Hint,
};

export class VibrancyDiagnostics {
    constructor(
        private readonly _collection: vscode.DiagnosticCollection,
    ) {}

    /** Update diagnostics for a pubspec.yaml document. */
    update(uri: vscode.Uri, content: string, results: VibrancyResult[]): void {
        const diagnostics: vscode.Diagnostic[] = [];

        for (const result of results) {
            if (result.category === 'vibrant') { continue; }

            const range = findPackageRange(content, result.package.name);
            if (!range) { continue; }

            const sevValue = categoryToSeverity(result.category);
            const severity = SEVERITY_MAP[sevValue] ?? vscode.DiagnosticSeverity.Hint;

            const message = buildMessage(result);
            const diag = new vscode.Diagnostic(
                new vscode.Range(
                    range.line, range.startChar,
                    range.line, range.endChar,
                ),
                message,
                severity,
            );
            diag.source = 'Saropa Package Vibrancy';
            diag.code = result.category;
            diagnostics.push(diag);
        }

        this._collection.set(uri, diagnostics);
    }

    clear(): void {
        this._collection.clear();
    }
}

function buildMessage(result: VibrancyResult): string {
    const label = categoryLabel(result.category);
    let msg = `[${label}] Score: ${result.score}/100`;
    if (result.knownIssue) {
        msg += ` — ${result.knownIssue.reason}`;
    }
    return msg;
}
