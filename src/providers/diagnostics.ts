import * as vscode from 'vscode';
import { VibrancyResult } from '../types';
import { findPackageRange } from '../services/pubspec-parser';
import { categoryToSeverity } from '../scoring/status-classifier';

const SEVERITY_MAP: Record<number, vscode.DiagnosticSeverity> = {
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
            const range = findPackageRange(content, result.package.name);
            if (!range) { continue; }

            const vscodeRange = new vscode.Range(
                range.line, range.startChar,
                range.line, range.endChar,
            );

            if (result.category !== 'vibrant') {
                const sevValue = categoryToSeverity(result.category);
                const severity = SEVERITY_MAP[sevValue] ?? vscode.DiagnosticSeverity.Hint;

                const message = buildMessage(result);
                const diag = new vscode.Diagnostic(
                    vscodeRange, message, severity,
                );
                diag.source = 'Saropa Package Vibrancy';
                diag.code = result.category;
                diagnostics.push(diag);
            }

            // Vibrant packages skip the vibrancy diagnostic above,
            // so show a standalone Hint when an update is available.
            if (result.category === 'vibrant'
                && result.updateInfo
                && result.updateInfo.updateStatus !== 'up-to-date') {
                const updateMsg = `${result.package.name} — Update available: ${result.updateInfo.currentVersion} → ${result.updateInfo.latestVersion} (${result.updateInfo.updateStatus})`;
                const updateDiag = new vscode.Diagnostic(
                    vscodeRange, updateMsg, vscode.DiagnosticSeverity.Hint,
                );
                updateDiag.source = 'Saropa Package Vibrancy';
                updateDiag.code = 'update-available';
                diagnostics.push(updateDiag);
            }
        }

        this._collection.set(uri, diagnostics);
    }

    clear(): void {
        this._collection.clear();
    }
}

function buildMessage(result: VibrancyResult): string {
    const score = Math.round(result.score / 10);
    const name = result.package.name;

    let msg: string;
    if (result.knownIssue?.replacement) {
        msg = `Replace ${name} with ${result.knownIssue.replacement}`;
    } else if (result.category === 'end-of-life') {
        msg = `Replace ${name}`;
    } else if (result.category === 'legacy-locked') {
        msg = `Review ${name}`;
    } else {
        msg = `Monitor ${name}`;
    }

    if (result.knownIssue) {
        msg += ` — ${result.knownIssue.reason}`;
    }
    if (result.updateInfo
        && result.updateInfo.updateStatus !== 'up-to-date') {
        msg += ` | Update: ${result.updateInfo.currentVersion} → ${result.updateInfo.latestVersion}`;
    }

    return `${msg} (${score}/10)`;
}
