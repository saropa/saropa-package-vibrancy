import * as vscode from 'vscode';
import { parsePubspecYaml } from '../services/pubspec-parser';
import { fetchPackageInfo } from '../services/pub-dev-api';
import { getLatestResults } from '../extension-activation';
import { findPubspecYaml } from './tree-commands';

const SDK_PACKAGES = new Set([
    'flutter', 'flutter_test', 'flutter_localizations',
    'flutter_web_plugins', 'flutter_driver',
]);

const MAX_DESC_LENGTH = 80;
const PUB_URL_PREFIX = '# https://pub.dev/packages/';
const FETCH_CONCURRENCY = 3;

let annotateInProgress = false;

/** Register the annotate-pubspec command. */
export function registerAnnotateCommand(
    context: vscode.ExtensionContext,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.annotatePubspec',
            () => annotatePubspec(),
        ),
    );
}

/** Add description comments above each dependency in pubspec.yaml. */
async function annotatePubspec(): Promise<void> {
    if (annotateInProgress) {
        vscode.window.showWarningMessage('Annotation already in progress');
        return;
    }
    annotateInProgress = true;
    try {
        await annotatePubspecInner();
    } finally {
        annotateInProgress = false;
    }
}

async function annotatePubspecInner(): Promise<void> {
    const yamlUri = await findPubspecYaml();
    if (!yamlUri) {
        vscode.window.showWarningMessage('No pubspec.yaml found in workspace');
        return;
    }

    const doc = await vscode.workspace.openTextDocument(yamlUri);
    const content = doc.getText();
    const { directDeps, devDeps } = parsePubspecYaml(content);
    const allDeps = [...directDeps, ...devDeps]
        .filter(n => !SDK_PACKAGES.has(n));

    if (allDeps.length === 0) {
        vscode.window.showInformationMessage('No dependencies to annotate');
        return;
    }

    const descriptions = await fetchDescriptions(allDeps);
    const edits = buildAnnotationEdits(doc, allDeps, descriptions);
    if (edits.length === 0) { return; }

    const wsEdit = new vscode.WorkspaceEdit();
    for (const edit of edits) {
        if (edit.deleteRange) {
            wsEdit.delete(yamlUri, edit.deleteRange);
        }
        wsEdit.insert(yamlUri, edit.insertPos, edit.text);
    }
    await vscode.workspace.applyEdit(wsEdit);
    await doc.save();

    vscode.window.showInformationMessage(
        `Annotated ${edits.length} dependencies in pubspec.yaml`,
    );
}

/** Fetch descriptions from cached scan results or pub.dev API. */
async function fetchDescriptions(
    names: string[],
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const missing: string[] = [];

    for (const r of getLatestResults()) {
        if (r.pubDev?.description) {
            map.set(r.package.name, r.pubDev.description);
        }
    }

    for (const name of names) {
        if (!map.has(name)) { missing.push(name); }
    }
    if (missing.length === 0) { return map; }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Fetching package descriptions...',
        },
        async (progress) => {
            let completed = 0;
            let cursor = 0;
            async function next(): Promise<void> {
                while (cursor < missing.length) {
                    const name = missing[cursor++];
                    progress.report({
                        message: `${name} (${++completed}/${missing.length})`,
                    });
                    const info = await fetchPackageInfo(name);
                    if (info?.description) {
                        map.set(name, info.description);
                    }
                }
            }
            const workers = Array.from(
                { length: Math.min(FETCH_CONCURRENCY, missing.length) },
                () => next(),
            );
            await Promise.all(workers);
        },
    );

    return map;
}

/** Format annotation comment lines for a package. */
export function formatAnnotation(
    name: string,
    description: string | null,
): string {
    const url = `  ${PUB_URL_PREFIX}${name}`;
    if (!description) { return `${url}\n`; }

    const truncated = description.length > MAX_DESC_LENGTH
        ? description.slice(0, MAX_DESC_LENGTH - 3) + '...'
        : description;
    return `  # ${truncated}\n${url}\n`;
}

interface AnnotationEdit {
    readonly insertPos: vscode.Position;
    readonly text: string;
    readonly deleteRange?: vscode.Range;
}

/** Build edits to insert or replace annotations above each package. */
export function buildAnnotationEdits(
    doc: vscode.TextDocument,
    packageNames: string[],
    descriptions: Map<string, string>,
): AnnotationEdit[] {
    const edits: AnnotationEdit[] = [];

    for (const name of packageNames) {
        const lineIdx = findPackageLine(doc, name);
        if (lineIdx === null) { continue; }

        const existing = findExistingAnnotation(doc, lineIdx, name);
        const text = formatAnnotation(name, descriptions.get(name) ?? null);

        if (existing) {
            edits.push({
                insertPos: new vscode.Position(existing.start, 0),
                text,
                deleteRange: new vscode.Range(
                    new vscode.Position(existing.start, 0),
                    new vscode.Position(existing.end, 0),
                ),
            });
        } else {
            edits.push({
                insertPos: new vscode.Position(lineIdx, 0),
                text,
            });
        }
    }

    return edits;
}

/** Find the line number of a package entry in a pubspec document. */
function findPackageLine(
    doc: vscode.TextDocument,
    packageName: string,
): number | null {
    const pattern = new RegExp(`^\\s{2}${packageName}\\s*:`);
    for (let i = 0; i < doc.lineCount; i++) {
        if (pattern.test(doc.lineAt(i).text)) { return i; }
    }
    return null;
}

/** Detect existing annotation comment lines above a package entry. */
function findExistingAnnotation(
    doc: vscode.TextDocument,
    packageLine: number,
    packageName: string,
): { start: number; end: number } | null {
    const urlMarker = `${PUB_URL_PREFIX}${packageName}`;
    let cursor = packageLine - 1;

    if (cursor < 0) { return null; }
    if (!doc.lineAt(cursor).text.trim().startsWith(urlMarker.trim())) {
        return null;
    }

    const urlLine = cursor;
    cursor--;

    if (cursor >= 0 && doc.lineAt(cursor).text.match(/^\s+#\s/)) {
        const above = doc.lineAt(cursor).text.trim();
        if (!above.startsWith(PUB_URL_PREFIX.trim())) {
            return { start: cursor, end: urlLine + 1 };
        }
    }

    return { start: urlLine, end: urlLine + 1 };
}
