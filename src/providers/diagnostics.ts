import * as vscode from 'vscode';
import { VibrancyResult, FamilySplit, OverrideAnalysis, BudgetResult } from '../types';
import { findPackageRange } from '../services/pubspec-parser';
import { categoryToSeverity } from '../scoring/status-classifier';
import { formatAge, isOldOverride } from '../scoring/override-analyzer';
import { getEndOfLifeDiagnostics } from '../services/config-service';
import { buildExceededDiagnostics } from '../scoring/budget-checker';

const SEVERITY_MAP: Record<number, vscode.DiagnosticSeverity> = {
    1: vscode.DiagnosticSeverity.Warning,
    2: vscode.DiagnosticSeverity.Information,
    3: vscode.DiagnosticSeverity.Hint,
};

export class VibrancyDiagnostics {
    private _splitsByPackage = new Map<string, FamilySplit>();
    private _overrideAnalyses: OverrideAnalysis[] = [];
    private _budgetResults: BudgetResult[] = [];

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

    /** Update override analyses for diagnostic generation. */
    updateOverrideAnalyses(analyses: OverrideAnalysis[]): void {
        this._overrideAnalyses = analyses;
    }

    /** Update budget check results. */
    updateBudgetResults(results: readonly BudgetResult[]): void {
        this._budgetResults = [...results];
    }

    /** Update diagnostics for a pubspec.yaml document. */
    update(uri: vscode.Uri, content: string, results: VibrancyResult[]): void {
        const diagnostics: vscode.Diagnostic[] = [];
        const eolSetting = getEndOfLifeDiagnostics();

        for (const result of results) {
            const range = findPackageRange(content, result.package.name);
            if (!range) { continue; }

            const vscodeRange = new vscode.Range(
                range.line, range.startChar,
                range.line, range.endChar,
            );

            if (result.category !== 'vibrant') {
                const shouldSkip = result.category === 'end-of-life' && eolSetting === 'none';
                if (!shouldSkip) {
                    const severity = computeSeverity(result, eolSetting);
                    const message = buildMessage(result);
                    const diag = new vscode.Diagnostic(
                        vscodeRange, message, severity,
                    );
                    diag.source = 'Saropa Package Vibrancy';
                    diag.code = result.category;
                    diagnostics.push(diag);
                }
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

        this._addOverrideDiagnostics(content, diagnostics);
        this._addBudgetDiagnostics(results, diagnostics);
        this._collection.set(uri, diagnostics);
    }

    private _addBudgetDiagnostics(
        results: VibrancyResult[],
        diagnostics: vscode.Diagnostic[],
    ): void {
        const messages = buildExceededDiagnostics(results, this._budgetResults);
        if (messages.length === 0) { return; }

        const range = new vscode.Range(0, 0, 0, 0);
        for (const message of messages) {
            const diag = new vscode.Diagnostic(
                range, message, vscode.DiagnosticSeverity.Warning,
            );
            diag.source = 'Saropa Package Vibrancy';
            diag.code = 'budget-exceeded';
            diagnostics.push(diag);
        }
    }

    private _addOverrideDiagnostics(
        content: string,
        diagnostics: vscode.Diagnostic[],
    ): void {
        const lines = content.split('\n');

        for (const analysis of this._overrideAnalyses) {
            const lineNum = analysis.entry.line;
            if (lineNum < 0 || lineNum >= lines.length) { continue; }

            const line = lines[lineNum];
            const match = line.match(/^\s{2}(\w[\w_]*)/);
            if (!match) { continue; }

            const startChar = line.indexOf(match[1]);
            const endChar = startChar + match[1].length;
            const vscodeRange = new vscode.Range(
                lineNum, startChar,
                lineNum, endChar,
            );

            if (analysis.status === 'stale') {
                const msg = `Stale override: no conflict detected for ${analysis.entry.name}. Safe to remove.`;
                const diag = new vscode.Diagnostic(
                    vscodeRange, msg, vscode.DiagnosticSeverity.Warning,
                );
                diag.source = 'Saropa Package Vibrancy';
                diag.code = 'stale-override';
                diagnostics.push(diag);
            } else {
                const blockerInfo = analysis.blocker
                    ? ` — bypasses constraint from ${analysis.blocker}`
                    : '';
                const ageInfo = analysis.ageDays !== null
                    ? `. Added ${formatAge(analysis.ageDays)} ago`
                    : '';
                const msg = `Active override on ${analysis.entry.name}${blockerInfo}${ageInfo}.`;
                const diag = new vscode.Diagnostic(
                    vscodeRange, msg, vscode.DiagnosticSeverity.Information,
                );
                diag.source = 'Saropa Package Vibrancy';
                diag.code = 'active-override';
                diagnostics.push(diag);

                if (isOldOverride(analysis)) {
                    const oldMsg = `Override on ${analysis.entry.name} is ${formatAge(analysis.ageDays!)} old. Review whether it's still needed.`;
                    const oldDiag = new vscode.Diagnostic(
                        vscodeRange, oldMsg, vscode.DiagnosticSeverity.Hint,
                    );
                    oldDiag.source = 'Saropa Package Vibrancy';
                    oldDiag.code = 'old-override';
                    diagnostics.push(oldDiag);
                }
            }
        }
    }

    clear(): void {
        this._collection.clear();
    }
}

function computeSeverity(
    result: VibrancyResult,
    eolSetting: string,
): vscode.DiagnosticSeverity {
    if (result.category === 'end-of-life') {
        if (eolSetting === 'smart' && result.knownIssue?.replacement) {
            return vscode.DiagnosticSeverity.Warning;
        }
        return vscode.DiagnosticSeverity.Hint;
    }
    const sevValue = categoryToSeverity(result.category);
    return SEVERITY_MAP[sevValue] ?? vscode.DiagnosticSeverity.Hint;
}

function buildMessage(result: VibrancyResult): string {
    const score = Math.round(result.score / 10);
    const name = result.package.name;

    let msg: string;
    if (result.knownIssue?.replacement) {
        msg = `Replace ${name} with ${result.knownIssue.replacement}`;
    } else if (result.category === 'end-of-life') {
        msg = `Deprecated: ${name}`;
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
