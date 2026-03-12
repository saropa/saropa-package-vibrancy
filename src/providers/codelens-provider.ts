import * as vscode from 'vscode';
import { VibrancyResult } from '../types';
import { findPackageRange } from '../services/pubspec-parser';
import {
    formatCodeLensTitle, CodeLensDetail,
} from '../scoring/codelens-formatter';
import { CodeLensToggle } from '../ui/codelens-toggle';

let globalToggle: CodeLensToggle | null = null;

/** Set the global toggle instance (called from extension-activation). */
export function setCodeLensToggle(toggle: CodeLensToggle): void {
    globalToggle = toggle;
}

export class VibrancyCodeLensProvider implements vscode.CodeLensProvider {
    private _results = new Map<string, VibrancyResult>();
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChange.event;

    updateResults(results: VibrancyResult[]): void {
        this._results.clear();
        for (const r of results) {
            this._results.set(r.package.name, r);
        }
        this._onDidChange.fire();
    }

    /** Refresh CodeLens display (called when toggle changes). */
    refresh(): void {
        this._onDidChange.fire();
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!isEnabled()) { return []; }
        if (!document.fileName.endsWith('pubspec.yaml')) { return []; }
        if (this._results.size === 0) { return []; }

        const content = document.getText();
        const detail = readDetailLevel();
        return buildLenses(content, this._results, detail);
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}

function buildLenses(
    content: string,
    results: ReadonlyMap<string, VibrancyResult>,
    detail: CodeLensDetail,
): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];

    for (const [name, result] of results) {
        const pkgRange = findPackageRange(content, name);
        if (!pkgRange) { continue; }

        const range = new vscode.Range(
            pkgRange.line, pkgRange.startChar,
            pkgRange.line, pkgRange.endChar,
        );
        const title = formatCodeLensTitle(result, detail);
        lenses.push(new vscode.CodeLens(range, {
            title,
            command: 'saropaPackageVibrancy.goToPackage',
            arguments: [name],
        }));
    }

    return lenses;
}

function isEnabled(): boolean {
    if (globalToggle) {
        return globalToggle.isEnabled;
    }
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    return config.get<boolean>('enableCodeLens', true);
}

function readDetailLevel(): CodeLensDetail {
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const level = config.get<string>('codeLensDetail', 'standard');
    if (level === 'minimal' || level === 'full') { return level; }
    return 'standard';
}
