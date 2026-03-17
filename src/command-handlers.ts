/** VS Code command registration and simple command handlers. */
import * as vscode from 'vscode';
import { _state } from './activation-state';
import type { ScanTargets } from './extension-activation';
import { VibrancyResult, NewVersionNotification } from './types';
import { VibrancyReportPanel } from './views/report-webview';
import { KnownIssuesPanel } from './views/known-issues-webview';
import { AboutPanel } from './views/about-webview';
import { WeightsPanel } from './views/weights-webview';
import { exportReports } from './services/report-exporter';
import { exportSbomReport } from './services/sbom-exporter';
import {
    formatNotificationMessage, createNotificationActions,
} from './services/freshness-watcher';
import { runScan } from './scan-runner';
import {
    suppressPackageByName, suppressByCategory,
    suppressAllProblems, unsuppressAll,
} from './suppress-commands';
import {
    planAndExecuteUpgrades, updateToPrerelease,
    runBulkUpdate, runSortDependencies, runComparePackages,
} from './advanced-commands';
import { generateCiConfig } from './ci-commands';

/** Register all extension commands. */
export function registerCommands(
    context: vscode.ExtensionContext,
    targets: ScanTargets,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.scan',
            () => runScan(targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.showReport',
            () => VibrancyReportPanel.createOrShow(_state.latestResults),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.clearCache',
            async () => {
                await targets.cache.clear();
                vscode.window.showInformationMessage('Vibrancy cache cleared');
            },
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.exportReport',
            () => requireResults(
                r => exportReports(r, _state.lastScanMeta).then(f => f.length || null),
                n => `Reports saved: ${n} files`,
            ),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.browseKnownIssues',
            () => KnownIssuesPanel.createOrShow(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.adjustWeights',
            () => WeightsPanel.createOrShow(_state.latestResults),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.about',
            () => AboutPanel.createOrShow(
                context.extension.packageJSON.version,
            ),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.exportSbom',
            () => requireResults(
                r => exportSbomReport(r, context.extension.packageJSON.version),
                p => `SBOM exported: ${p}`,
            ),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.planUpgrades',
            () => planAndExecuteUpgrades(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.goToOverride',
            (packageName: string) => goToOverride(packageName),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.suppressPackageByName',
            (packageName: string) => suppressPackageByName(packageName, targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.suppressByCategory',
            () => suppressByCategory(targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.suppressAllProblems',
            () => suppressAllProblems(targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.unsuppressAll',
            () => unsuppressAll(targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.sortDependencies',
            () => runSortDependencies(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.showCodeLens',
            () => targets.codeLensToggle.show(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.hideCodeLens',
            () => targets.codeLensToggle.hide(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.toggleCodeLens',
            () => targets.codeLensToggle.toggle(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.showPrereleases',
            () => targets.prereleaseToggle.show(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.hidePrereleases',
            () => targets.prereleaseToggle.hide(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.updateToPrerelease',
            (packageName: string, version: string) =>
                updateToPrerelease(packageName, version),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.updateAllLatest',
            () => runBulkUpdate('all', targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.updateAllMajor',
            () => runBulkUpdate('major', targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.updateAllMinor',
            () => runBulkUpdate('minor', targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.updateAllPatch',
            () => runBulkUpdate('patch', targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.generateCiConfig',
            () => generateCiConfig(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.comparePackages',
            () => runComparePackages(targets.cache),
        ),
    );
}

/** Guard that requires scan results before running an action. */
async function requireResults<T>(
    action: (results: VibrancyResult[]) => Promise<T | null>,
    successMsg: (result: T) => string,
): Promise<void> {
    if (_state.latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }
    const result = await action(_state.latestResults);
    if (result) {
        vscode.window.showInformationMessage(successMsg(result));
    }
}

/** Navigate to a dependency_overrides entry in pubspec.yaml. */
async function goToOverride(packageName: string): Promise<void> {
    const analysis = _state.lastOverrideAnalyses.find(a => a.entry.name === packageName);
    if (!analysis || !_state.lastParsedDeps) { return; }

    const doc = await vscode.workspace.openTextDocument(_state.lastParsedDeps.yamlUri);
    const editor = await vscode.window.showTextDocument(doc);

    const line = analysis.entry.line;
    const lineText = doc.lineAt(line).text;
    const match = lineText.match(/^\s{2}(\w[\w_]*)/);
    const startChar = match ? lineText.indexOf(match[1]) : 2;
    const endChar = match ? startChar + match[1].length : lineText.length;

    const range = new vscode.Range(line, startChar, line, endChar);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

/** Handle freshness watcher notifications for new package versions. */
export async function handleNewVersions(
    notifications: NewVersionNotification[],
): Promise<void> {
    if (notifications.length === 0) { return; }

    const message = formatNotificationMessage(notifications);
    const actions = createNotificationActions();

    const choice = await vscode.window.showInformationMessage(
        message,
        ...actions,
    );

    switch (choice) {
        case 'View Details':
            vscode.commands.executeCommand('saropaPackageVibrancy.showReport');
            break;
        case 'Update All':
            vscode.commands.executeCommand('saropaPackageVibrancy.planUpgrades');
            break;
        case 'Dismiss':
            break;
    }
}
