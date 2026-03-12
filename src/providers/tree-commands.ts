import * as vscode from 'vscode';
import { findPackageRange } from '../services/pubspec-parser';
import {
    findPubspecYaml, buildVersionEdit, findPackageLines, buildBackupUri,
    readVersionConstraint,
} from '../services/pubspec-editor';
import {
    addSuppressedPackage, removeSuppressedPackage,
} from '../services/config-service';
import { DetailItem, PackageItem } from './tree-items';
import { DetailViewProvider } from '../views/detail-view-provider';
import { DetailLogger } from '../services/detail-logger';
import { getLatestResults } from '../extension-activation';
import { UpdateFromCodeLensArgs } from './codelens-provider';

// Re-export for backward compatibility
export { findPubspecYaml, buildVersionEdit, findPackageLines, readVersionConstraint };

let _detailViewProvider: DetailViewProvider | null = null;
let _detailLogger: DetailLogger | null = null;

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
        vscode.commands.registerCommand('saropaPackageVibrancy.openOnPubDev', openOnPubDev),
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
    );
}

/** Navigate to a package's entry in pubspec.yaml. */
async function goToPackage(packageName: string): Promise<void> {
    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const range = findPackageRange(doc.getText(), packageName);
    if (!range) { return; }

    const pos = new vscode.Position(range.line, range.startChar);
    const sel = new vscode.Selection(pos, pos);
    await vscode.window.showTextDocument(doc, { selection: sel });
}

/** Open a package's pub.dev page in the browser. */
async function openOnPubDev(item: PackageItem): Promise<void> {
    const url = `https://pub.dev/packages/${item.result.package.name}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));
}

/** Open a URL in the default browser (from click or inline action). */
async function openUrl(urlOrItem: string | DetailItem): Promise<void> {
    if (!urlOrItem) { return; }
    const url = typeof urlOrItem === 'string' ? urlOrItem : urlOrItem.url;
    if (!url) { return; }
    await vscode.env.openExternal(vscode.Uri.parse(url));
}

/** Replace the version constraint in pubspec.yaml with ^latest. */
async function updateToLatest(item: PackageItem): Promise<void> {
    const latest = item.result.updateInfo?.latestVersion;
    if (!latest) { return; }

    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const edit = buildVersionEdit(doc, item.result.package.name, `^${latest}`);
    if (!edit) {
        vscode.window.showWarningMessage(
            `Could not locate version constraint for ${item.result.package.name}`,
        );
        return;
    }

    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(yamlUri, edit.range, edit.newText);
    await vscode.workspace.applyEdit(wsEdit);
    await doc.save();
}

/** Copy the package's vibrancy result to the clipboard as JSON. */
async function copyAsJson(item: PackageItem): Promise<void> {
    const json = JSON.stringify(item.result, null, 2);
    await vscode.env.clipboard.writeText(json);
    vscode.window.showInformationMessage(
        `Copied ${item.result.package.name} vibrancy data to clipboard`,
    );
}

/** Add a package to the suppressed list in workspace settings. */
async function suppressPackage(item: PackageItem): Promise<void> {
    await addSuppressedPackage(item.result.package.name);
}

/** Remove a package from the suppressed list in workspace settings. */
async function unsuppressPackage(item: PackageItem): Promise<void> {
    await removeSuppressedPackage(item.result.package.name);
}


/** Comment out an unused dependency in pubspec.yaml. */
async function commentOutUnused(item: PackageItem): Promise<void> {
    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const lines = findPackageLines(doc, item.result.package.name);
    if (!lines) { return; }

    const wsEdit = new vscode.WorkspaceEdit();
    for (let i = lines.start; i < lines.end; i++) {
        wsEdit.insert(yamlUri, new vscode.Position(i, 0), '# ');
    }
    await vscode.workspace.applyEdit(wsEdit);
    await doc.save();
}

/** Delete an unused dependency from pubspec.yaml, creating a backup. */
async function deleteUnused(item: PackageItem): Promise<void> {
    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const lines = findPackageLines(doc, item.result.package.name);
    if (!lines) { return; }

    const backupUri = buildBackupUri(yamlUri);
    const content = new TextEncoder().encode(doc.getText());
    await vscode.workspace.fs.writeFile(backupUri, content);

    const wsEdit = new vscode.WorkspaceEdit();
    const range = new vscode.Range(
        new vscode.Position(lines.start, 0),
        new vscode.Position(lines.end, 0),
    );
    wsEdit.delete(yamlUri, range);
    await vscode.workspace.applyEdit(wsEdit);
    await doc.save();

    const backupName = backupUri.path.split('/').pop();
    vscode.window.showInformationMessage(
        `Deleted ${item.result.package.name} from pubspec.yaml (backup: ${backupName})`,
    );
}

/** Focus the package details view in the sidebar. */
function focusDetails(): void {
    if (_detailViewProvider) {
        _detailViewProvider.focus();
    }
}

/** Log a package's details to the output channel. */
function logDetails(item: PackageItem): void {
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

/** Update a package version directly from CodeLens click. */
async function updateFromCodeLens(args: UpdateFromCodeLensArgs): Promise<void> {
    if (!args || !args.packageName || !args.targetVersion) {
        return;
    }

    const yamlUri = args.pubspecPath
        ? vscode.Uri.file(args.pubspecPath)
        : await findPubspecYaml();

    if (!yamlUri) {
        vscode.window.showWarningMessage('Could not find pubspec.yaml');
        return;
    }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const newConstraint = `^${args.targetVersion}`;
    const edit = buildVersionEdit(doc, args.packageName, newConstraint);

    if (!edit) {
        vscode.window.showWarningMessage(
            `Could not locate version constraint for ${args.packageName}`,
        );
        return;
    }

    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(yamlUri, edit.range, edit.newText);
    const applied = await vscode.workspace.applyEdit(wsEdit);

    if (applied) {
        await doc.save();
        vscode.window.showInformationMessage(
            `Updated ${args.packageName} to ${newConstraint}`,
        );
    } else {
        vscode.window.showWarningMessage(
            `Failed to update ${args.packageName}`,
        );
    }
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

