import * as vscode from 'vscode';
import { VibrancyResult, FamilySplit } from '../types';
import { findPackageRange } from '../services/pubspec-parser';
import { categoryToSeverity } from '../scoring/status-classifier';

const SEVERITY_MAP: Record<number, vscode.DiagnosticSeverity> = {
    1: vscode.DiagnosticSeverity.Warning,
    2: vscode.DiagnosticSeverity.Information,
    3: vscode.DiagnosticSeverity.Hint,
};

export class VibrancyDiagnostics {
    private _splitsByPackage = new Map<string, FamilySplit>();

    constructor(
        private readonly _collection: vscode.DiagnosticCollection,
    ) {}

    /** Update detected family splits for diagnostic generation. */
    updateFamilySplits(splits: FamilySplit[]): void {
        this._splitsByPackage.clear();
        for (const split of splits) {
            for (const group of split.versionGroups) {
                for (const pkg of group.packages) {
                    this._splitsByPackage.set(pkg, split);
                }
            }
        }
    }

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

            if (result.isUnused) {
                const unusedMsg = `Unused dependency — no imports found for ${result.package.name} in lib/, bin/, or test/`;
                const unusedDiag = new vscode.Diagnostic(
                    vscodeRange, unusedMsg, vscode.DiagnosticSeverity.Hint,
                );
                unusedDiag.source = 'Saropa Package Vibrancy';
                unusedDiag.code = 'unused-dependency';
                diagnostics.push(unusedDiag);
            }

            const split = this._splitsByPackage.get(result.package.name);
            if (split) {
                const msg = buildFamilyConflictMessage(
                    result.package.name, split,
                );
                const splitDiag = new vscode.Diagnostic(
                    vscodeRange, msg, vscode.DiagnosticSeverity.Warning,
                );
                splitDiag.source = 'Saropa Package Vibrancy';
                splitDiag.code = 'family-conflict';
                diagnostics.push(splitDiag);
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

    if (result.knownIssue?.reason) {
        msg += ` — ${result.knownIssue.reason}`;
    }
    if (result.updateInfo
        && result.updateInfo.updateStatus !== 'up-to-date') {
        msg += ` | Update: ${result.updateInfo.currentVersion} → ${result.updateInfo.latestVersion}`;
    }
    if (result.blocker) {
        const bScore = result.blocker.blockerVibrancyScore;
        const scoreStr = bScore !== null
            ? ` (${Math.round(bScore / 10)}/10)` : '';
        msg += ` | Blocked: ${result.blocker.blockerPackage}${scoreStr}`;
    }

    const flaggedCount = result.github?.flaggedIssues?.length ?? 0;
    if (flaggedCount > 0) {
        msg += ` | ${flaggedCount} flagged issue(s)`;
    }

    return `${msg} (${score}/10)`;
}

function buildFamilyConflictMessage(
    packageName: string,
    split: FamilySplit,
): string {
    const ownGroup = split.versionGroups.find(
        g => g.packages.includes(packageName),
    );
    const otherVersions = split.versionGroups
        .filter(g => g !== ownGroup)
        .map(g => `v${g.majorVersion}`)
        .join(', ');
    const ownVersion = ownGroup ? `v${ownGroup.majorVersion}` : '?';
    return `Family conflict: ${packageName} is in the ${split.familyLabel} family on major ${ownVersion}, but other members use major ${otherVersions}`;
}
