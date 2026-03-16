/**
 * Pubspec-editing commands extracted from tree-commands.ts.
 *
 * These four functions modify pubspec.yaml on behalf of the
 * tree-view and CodeLens UI: update version, comment-out, delete,
 * and CodeLens-driven update.
 */

import * as vscode from 'vscode';
import { PackageItem } from './tree-items';
import {
    findPubspecYaml, buildVersionEdit, findPackageLines, buildBackupUri,
} from '../services/pubspec-editor';
import { UpdateFromCodeLensArgs } from './codelens-provider';
import { requirePackageItem } from './tree-commands';

/** Replace the version constraint in pubspec.yaml with ^latest. */
export async function updateToLatest(item: PackageItem | undefined): Promise<void> {
    if (!requirePackageItem(item, 'Update to Latest')) { return; }
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

/** Comment out an unused dependency in pubspec.yaml. */
export async function commentOutUnused(item: PackageItem | undefined): Promise<void> {
    if (!requirePackageItem(item, 'Comment Out Unused')) { return; }
    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const lines = findPackageLines(doc, item.result.package.name);
    if (!lines) { return; }

    // Prefix each line belonging to this dependency with '# '
    const wsEdit = new vscode.WorkspaceEdit();
    for (let i = lines.start; i < lines.end; i++) {
        wsEdit.insert(yamlUri, new vscode.Position(i, 0), '# ');
    }
    await vscode.workspace.applyEdit(wsEdit);
    await doc.save();
}

/** Delete an unused dependency from pubspec.yaml, creating a backup first. */
export async function deleteUnused(item: PackageItem | undefined): Promise<void> {
    if (!requirePackageItem(item, 'Delete Unused')) { return; }
    const yamlUri = await findPubspecYaml();
    if (!yamlUri) { return; }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const lines = findPackageLines(doc, item.result.package.name);
    if (!lines) { return; }

    // Write a timestamped backup before destructive edit
    const backupUri = buildBackupUri(yamlUri);
    const content = new TextEncoder().encode(doc.getText());
    await vscode.workspace.fs.writeFile(backupUri, content);

    // Remove the dependency lines from the document
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
 * Update a package version directly from a CodeLens click.
 * Unlike updateToLatest, this receives explicit args rather than a tree item.
 */
export async function updateFromCodeLens(args: UpdateFromCodeLensArgs): Promise<void> {
    if (!args || !args.packageName || !args.targetVersion) {
        return;
    }

    // Use the pubspec path from the CodeLens args, or fall back to discovery
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
