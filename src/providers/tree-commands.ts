import * as vscode from 'vscode';
import { findPackageRange } from '../services/pubspec-parser';
import {
    findPubspecYaml, readVersionConstraint,
} from '../services/pubspec-editor';
import {
    addSuppressedPackage, removeSuppressedPackage,
} from '../services/config-service';
import { DetailItem, PackageItem } from './tree-items';
import { DetailViewProvider } from '../views/detail-view-provider';
import { DetailLogger } from '../services/detail-logger';
import { getLatestResults } from '../extension-activation';
import { ComparisonPanel } from '../views/comparison-webview';
import { resultToComparisonData } from '../scoring/comparison-ranker';

// Import the four pubspec-editing commands from the split-out module
import {
    updateToLatest, commentOutUnused, deleteUnused, updateFromCodeLens,
} from './tree-commands-edit';

// Re-export pubspec-editor helpers for consumers that import from this module
export { findPubspecYaml, readVersionConstraint };
// Re-export buildVersionEdit and findPackageLines via pubspec-editor
// (detail-view-provider and tests import them from this module)
export { buildVersionEdit, findPackageLines } from '../services/pubspec-editor';

let _detailViewProvider: DetailViewProvider | null = null;
let _detailLogger: DetailLogger | null = null;

/**
 * Guard for commands that require a PackageItem from the Packages view.
 * Returns true if item has result.package.name; otherwise shows a warning and returns false.
 * Exported so tree-commands-edit.ts can share the same guard logic.
 */
export function requirePackageItem(
    item: PackageItem | undefined,
    actionLabel: string,
): item is PackageItem {
    if (item?.result?.package?.name) { return true; }
    vscode.window.showWarningMessage(
        `${actionLabel} is only available for package items in the Packages view.`,
    );
    return false;
}

/** Register tree-item commands (navigate, open, update, copy, suppress). */
export function registerTreeCommands(
    context: vscode.ExtensionContext,
    detailViewProvider?: DetailViewProvider | null,
    detailLogger?: DetailLogger | null,
): void {
    _detailViewProvider = detailViewProvider ?? null;
    _detailLogger = detailLogger ?? null;

    context.subscriptions.push(
        vscode.commands.registerCommand('saropaPackageVibrancy.goToPackage', goToPackage),
        vscode.commands.registerCommand('saropaPackageVibrancy.goToLine', goToLine),
        vscode.commands.registerCommand('saropaPackageVibrancy.openOnPubDev', openOnPubDev),
        vscode.commands.registerCommand('saropaPackageVibrancy.showChangelog', showChangelog),
        vscode.commands.registerCommand('saropaPackageVibrancy.updateToLatest', updateToLatest),
        vscode.commands.registerCommand('saropaPackageVibrancy.copyAsJson', copyAsJson),
        vscode.commands.registerCommand('saropaPackageVibrancy.suppressPackage', suppressPackage),
        vscode.commands.registerCommand('saropaPackageVibrancy.unsuppressPackage', unsuppressPackage),
        vscode.commands.registerCommand('saropaPackageVibrancy.openUrl', openUrl),
        vscode.commands.registerCommand('saropaPackageVibrancy.commentOutUnused', commentOutUnused),
        vscode.commands.registerCommand('saropaPackageVibrancy.deleteUnused', deleteUnused),
        vscode.commands.registerCommand('saropaPackageVibrancy.focusDetails', focusDetails),
        vscode.commands.registerCommand('saropaPackageVibrancy.logDetails', logDetails),
        vscode.commands.registerCommand('saropaPackageVibrancy.logAllDetails', logAllDetails),
        vscode.commands.registerCommand('saropaPackageVibrancy.updateFromCodeLens', updateFromCodeLens),
        vscode.commands.registerCommand('saropaPackageVibrancy.focusPackageInTree', focusPackageInTree),
        vscode.commands.registerCommand('saropaPackageVibrancy.compareSelected', compareSelected),
    );
}

/** Navigate to a package's entry in pubspec.yaml. */
async function goToPackage(packageName: string | undefined): Promise<void> {
    if (!packageName || typeof packageName !== 'string') { return; }
    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const range = findPackageRange(doc.getText(), packageName);
    if (!range) { return; }

    const pos = new vscode.Position(range.line, range.startChar);
    const sel = new vscode.Selection(pos, pos);
    await vscode.window.showTextDocument(doc, { selection: sel });
}

/** Open pubspec.yaml at a given 0-based line. Used when clicking a problem in the Problems view. */
async function goToLine(line: number | undefined): Promise<void> {
    if (line == null || typeof line !== 'number' || line < 0) { return; }
    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const pos = new vscode.Position(line, 0);
    const sel = new vscode.Selection(pos, pos);
    await vscode.window.showTextDocument(doc, { selection: sel });
}

/** Open a package's pub.dev page in the browser. */
async function openOnPubDev(item: PackageItem | undefined): Promise<void> {
    if (!requirePackageItem(item, 'Open on pub.dev')) { return; }
    const url = `https://pub.dev/packages/${item.result.package.name}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));
}

/** Open a package's changelog on pub.dev (used by detail view). */
async function showChangelog(packageName: string | undefined): Promise<void> {
    if (!packageName || typeof packageName !== 'string') { return; }
    const url = `https://pub.dev/packages/${packageName}/changelog`;
    await vscode.env.openExternal(vscode.Uri.parse(url));
}

/** Open a URL in the default browser (from click or inline action). */
async function openUrl(urlOrItem: string | DetailItem): Promise<void> {
    if (!urlOrItem) { return; }
    const url = typeof urlOrItem === 'string' ? urlOrItem : urlOrItem.url;
    if (!url) { return; }
    await vscode.env.openExternal(vscode.Uri.parse(url));
}

/** Copy the package's vibrancy result to the clipboard as JSON. */
async function copyAsJson(item: PackageItem | undefined): Promise<void> {
    if (!requirePackageItem(item, 'Copy as JSON')) { return; }
    const json = JSON.stringify(item.result, null, 2);
    await vscode.env.clipboard.writeText(json);
    vscode.window.showInformationMessage(
        `Copied ${item.result.package.name} vibrancy data to clipboard`,
    );
}

/** Add a package to the suppressed list in workspace settings. */
async function suppressPackage(item: PackageItem | undefined): Promise<void> {
    if (!requirePackageItem(item, 'Suppress')) { return; }
    await addSuppressedPackage(item.result.package.name);
}

/** Remove a package from the suppressed list in workspace settings. */
async function unsuppressPackage(item: PackageItem | undefined): Promise<void> {
    if (!requirePackageItem(item, 'Unsuppress')) { return; }
    await removeSuppressedPackage(item.result.package.name);
}

/** Focus the package details view in the sidebar. */
function focusDetails(): void {
    if (_detailViewProvider) {
        _detailViewProvider.focus();
    }
}

/** Log a package's details to the output channel. */
function logDetails(item: PackageItem | undefined): void {
    if (!requirePackageItem(item, 'Log to Output')) { return; }
    if (!_detailLogger) { return; }
    _detailLogger.logPackage(item.result);
    _detailLogger.show();
}

/** Log all package details to the output channel. */
function logAllDetails(): void {
    if (!_detailLogger) { return; }
    const results = getLatestResults();
    if (results.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }
    _detailLogger.clear();
    _detailLogger.logAllPackages(results);
    _detailLogger.show();
}

/** Focus a package in the tree view and show its details. */
async function focusPackageInTree(packageName: string): Promise<void> {
    if (!packageName) { return; }

    await vscode.commands.executeCommand(
        'saropaPackageVibrancy.packages.focus',
    );

    const results = getLatestResults();
    const result = results.find(r => r.package.name === packageName);

    if (result && _detailViewProvider) {
        _detailViewProvider.update(result);
    }
}

/** Compare selected packages in a side-by-side view. */
function compareSelected(
    _item: PackageItem | undefined,
    selectedItems?: PackageItem[],
): void {
    const raw = Array.isArray(selectedItems) ? selectedItems : [];
    const items = raw.filter((i): i is PackageItem => !!i?.result);

    if (items.length < 2) {
        vscode.window.showWarningMessage('Select 2-3 packages to compare');
        return;
    }

    if (items.length > 3) {
        vscode.window.showWarningMessage('Maximum 3 packages for comparison');
        return;
    }

    const comparisonData = items.map(item =>
        resultToComparisonData(item.result, true));

    ComparisonPanel.createOrShow(comparisonData);
}

// Re-export all pubspec-editing commands for backward compatibility
export * from './tree-commands-edit';
