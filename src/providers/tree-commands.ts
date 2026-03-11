import * as vscode from 'vscode';
import { findPackageRange } from '../services/pubspec-parser';
import { DetailItem, PackageItem } from './tree-items';

/** Register tree-item commands (navigate, open, update, copy, suppress). */
export function registerTreeCommands(
    context: vscode.ExtensionContext,
): void {
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
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const current = config.get<string[]>('suppressedPackages', []);
    const name = item.result.package.name;
    if (current.includes(name)) { return; }
    await config.update(
        'suppressedPackages',
        [...current, name],
        vscode.ConfigurationTarget.Workspace,
    );
}

/** Remove a package from the suppressed list in workspace settings. */
async function unsuppressPackage(item: PackageItem): Promise<void> {
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const current = config.get<string[]>('suppressedPackages', []);
    await config.update(
        'suppressedPackages',
        current.filter(n => n !== item.result.package.name),
        vscode.ConfigurationTarget.Workspace,
    );
}

/** Build a workspace edit to replace a package's version constraint. */
export function buildVersionEdit(
    doc: vscode.TextDocument,
    packageName: string,
    newConstraint: string,
): { range: vscode.Range; newText: string } | null {
    const pattern = new RegExp(
        `^(\\s{2}${packageName}\\s*:\\s*)(.+)$`,
    );
    for (let i = 0; i < doc.lineCount; i++) {
        const line = doc.lineAt(i);
        const match = line.text.match(pattern);
        if (match) {
            const start = new vscode.Position(i, match[1].length);
            const end = new vscode.Position(i, line.text.length);
            return { range: new vscode.Range(start, end), newText: newConstraint };
        }
    }
    return null;
}

/** Read the current version constraint for a package from pubspec.yaml. */
export function readVersionConstraint(
    doc: vscode.TextDocument,
    packageName: string,
): string | null {
    const pattern = new RegExp(
        `^\\s{2}${packageName}\\s*:\\s*(.+)$`,
    );
    for (let i = 0; i < doc.lineCount; i++) {
        const match = doc.lineAt(i).text.match(pattern);
        if (match) { return match[1].trim(); }
    }
    return null;
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

/**
 * Find the line range of a package entry in pubspec.yaml.
 * Includes the header line and any continuation lines (deeper indent).
 */
export function findPackageLines(
    doc: vscode.TextDocument,
    packageName: string,
): { start: number; end: number } | null {
    const header = new RegExp(`^\\s{2}${packageName}\\s*:`);
    for (let i = 0; i < doc.lineCount; i++) {
        if (!header.test(doc.lineAt(i).text)) { continue; }
        let end = i + 1;
        while (end < doc.lineCount) {
            const text = doc.lineAt(end).text;
            if (text.trim() === '' || /^\s{4,}\S/.test(text)) {
                end++;
            } else {
                break;
            }
        }
        return { start: i, end };
    }
    return null;
}

function buildBackupUri(yamlUri: vscode.Uri): vscode.Uri {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
        + `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return vscode.Uri.joinPath(yamlUri, '..', `pubspec.yaml.bak.${stamp}`);
}

/** Find the first pubspec.yaml in the workspace. */
export async function findPubspecYaml(): Promise<vscode.Uri | null> {
    const files = await vscode.workspace.findFiles(
        '**/pubspec.yaml', '**/.*/**', 1,
    );
    return files[0] ?? null;
}
