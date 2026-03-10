import * as vscode from 'vscode';
import { findPackageRange } from '../services/pubspec-parser';
import { PackageItem } from './tree-items';

/** Register tree-item commands (navigate, open pub.dev, update). */
export function registerTreeCommands(
    context: vscode.ExtensionContext,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('saropaPackageVibrancy.goToPackage', goToPackage),
        vscode.commands.registerCommand('saropaPackageVibrancy.openOnPubDev', openOnPubDev),
        vscode.commands.registerCommand('saropaPackageVibrancy.updateToLatest', updateToLatest),
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

/** Replace the version constraint in pubspec.yaml with ^latest. */
async function updateToLatest(item: PackageItem): Promise<void> {
    const latest = item.result.updateInfo?.latestVersion;
    if (!latest) { return; }

    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const edit = buildVersionEdit(doc, item.result.package.name, latest);
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

function buildVersionEdit(
    doc: vscode.TextDocument,
    packageName: string,
    latestVersion: string,
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
            return { range: new vscode.Range(start, end), newText: `^${latestVersion}` };
        }
    }
    return null;
}

async function findPubspecYaml(): Promise<vscode.Uri | null> {
    const files = await vscode.workspace.findFiles(
        '**/pubspec.yaml', '**/.*/**', 1,
    );
    return files[0] ?? null;
}
