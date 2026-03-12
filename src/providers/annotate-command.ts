import * as vscode from 'vscode';
import {
    parsePubspecYaml, parseDependencyOverrides,
} from '../services/pubspec-parser';
import { fetchPackageInfo } from '../services/pub-dev-api';
import { getLatestResults } from '../extension-activation';
import { findPubspecYaml } from '../services/pubspec-editor';

const SDK_PACKAGES = new Set([
    'flutter', 'flutter_test', 'flutter_localizations',
    'flutter_web_plugins', 'flutter_driver',
]);

const MAX_DESC_LENGTH = 80;
const PUB_URL_PREFIX = '# https://pub.dev/packages/';
const FETCH_CONCURRENCY = 3;

const SECTION_HEADERS: ReadonlyMap<string, string> = new Map([
    ['dependencies:', 'DEPENDENCIES'],
    ['dev_dependencies:', 'DEV DEPENDENCIES'],
    ['dependency_overrides:', 'DEP OVERRIDES'],
    ['flutter:', 'FLUTTER'],
    ['flutter_launcher_icons:', 'APP ICONS'],
    ['flutter_native_splash:', 'NATIVE SPLASH'],
]);

const SUB_SECTION_HEADERS: ReadonlyMap<string, { parent: string; title: string }> = new Map([
    ['assets:', { parent: 'flutter:', title: 'ASSETS' }],
    ['fonts:', { parent: 'flutter:', title: 'FONTS' }],
]);

const OVERRIDE_MARKER_TITLE = 'DEP OVERRIDDEN BELOW';

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
    const overrides = parseDependencyOverrides(content);
    const allDeps = [...directDeps, ...devDeps]
        .filter(n => !SDK_PACKAGES.has(n));

    if (allDeps.length === 0) {
        vscode.window.showInformationMessage('No dependencies to annotate');
        return;
    }

    const descriptions = await fetchDescriptions(allDeps);
    const edits = buildAnnotationEdits(doc, allDeps, descriptions);

    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const insertSectionHeaders = config.get<boolean>(
        'annotateSectionHeaders',
        true,
    );

    const allSectionEdits: SectionHeaderEdit[] = [];
    if (insertSectionHeaders) {
        allSectionEdits.push(...buildSectionHeaderEdits(doc));
        allSectionEdits.push(...buildSubSectionHeaderEdits(doc));
        const overrideMarker = buildOverrideMarkerEdit(
            doc, directDeps, overrides,
        );
        if (overrideMarker) {
            allSectionEdits.push(overrideMarker);
        }
    }

    if (edits.length === 0 && allSectionEdits.length === 0) { return; }

    const wsEdit = new vscode.WorkspaceEdit();

    for (const edit of allSectionEdits) {
        if (edit.deleteRange) {
            wsEdit.delete(yamlUri, edit.deleteRange);
        }
        wsEdit.insert(yamlUri, edit.insertPos, edit.text);
    }

    for (const edit of edits) {
        for (const delRange of edit.deleteRanges) {
            wsEdit.delete(yamlUri, delRange);
        }
        wsEdit.insert(yamlUri, edit.insertPos, edit.text);
    }

    await vscode.workspace.applyEdit(wsEdit);
    await doc.save();

    const parts: string[] = [];
    if (edits.length > 0) {
        parts.push(`${edits.length} dependencies`);
    }
    if (allSectionEdits.length > 0) {
        parts.push(`${allSectionEdits.length} section headers`);
    }
    vscode.window.showInformationMessage(
        `Annotated ${parts.join(' and ')} in pubspec.yaml`,
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
    readonly deleteRanges: vscode.Range[];
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

        const existing = findExistingAnnotations(doc, lineIdx, name);
        const text = formatAnnotation(name, descriptions.get(name) ?? null);

        const deleteRanges = existing.map(r => new vscode.Range(
            new vscode.Position(r.start, 0),
            new vscode.Position(r.end, 0),
        ));

        const insertLine = existing.length > 0
            ? Math.min(...existing.map(r => r.start))
            : lineIdx;

        edits.push({
            insertPos: new vscode.Position(insertLine, 0),
            text,
            deleteRanges,
        });
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

/**
 * Find all auto-generated annotation blocks above a package entry.
 * Scans consecutive comment lines and identifies URL + description pairs.
 * Returns an array of ranges to delete, preserving user comments.
 */
function findExistingAnnotations(
    doc: vscode.TextDocument,
    packageLine: number,
    packageName: string,
): Array<{ start: number; end: number }> {
    const urlPattern = new RegExp(
        `^\\s*#\\s*https://pub\\.dev/packages/${escapeRegExp(packageName)}(?:/[\\w-]*)?\\s*$`,
    );

    let cursor = packageLine - 1;
    if (cursor < 0) { return []; }

    const ranges: Array<{ start: number; end: number }> = [];
    const processedLines = new Set<number>();

    while (cursor >= 0) {
        const lineText = doc.lineAt(cursor).text;

        if (!lineText.match(/^\s*#/) && lineText.trim() !== '') {
            break;
        }

        if (lineText.trim() === '' || lineText.trim() === '#') {
            cursor--;
            continue;
        }

        if (urlPattern.test(lineText) && !processedLines.has(cursor)) {
            const urlLine = cursor;
            processedLines.add(urlLine);

            const descLine = cursor - 1;
            if (
                descLine >= 0
                && !processedLines.has(descLine)
                && isAutoDescription(doc.lineAt(descLine).text, packageName)
            ) {
                processedLines.add(descLine);
                ranges.push({ start: descLine, end: urlLine + 1 });
                cursor = descLine - 1;
            } else {
                ranges.push({ start: urlLine, end: urlLine + 1 });
                cursor--;
            }
        } else {
            cursor--;
        }
    }

    return ranges;
}

/**
 * Check if a line looks like an auto-generated description comment.
 * Auto descriptions are indented comment lines that don't look like user notes.
 */
function isAutoDescription(lineText: string, _packageName: string): boolean {
    const trimmed = lineText.trim();

    if (!trimmed.startsWith('#')) { return false; }
    if (trimmed.startsWith(PUB_URL_PREFIX.trim())) { return false; }

    const content = trimmed.replace(/^#\s*/, '');

    if (content.startsWith('NOTE:')) { return false; }
    if (content.startsWith('TODO:')) { return false; }
    if (content.startsWith('FIXME:')) { return false; }
    if (content.startsWith('IMPORTANT')) { return false; }
    if (content.startsWith('CRITICAL')) { return false; }
    if (content.startsWith('WARNING')) { return false; }
    if (/^#+\s/.test(content)) { return false; }
    if (/^Because\s/.test(content)) { return false; }

    const sentencePattern = /^[A-Z][^.]*\.\.\.$|^[A-Z][a-z].*[a-z]\.?$/;
    if (sentencePattern.test(content)) { return true; }

    return false;
}

/** Escape special regex characters in a string. */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface SectionHeaderEdit {
    readonly insertPos: vscode.Position;
    readonly text: string;
    readonly deleteRange?: vscode.Range;
}

/** Build edits to insert section headers above major pubspec sections. */
export function buildSectionHeaderEdits(
    doc: vscode.TextDocument,
): SectionHeaderEdit[] {
    const edits: SectionHeaderEdit[] = [];

    for (const [sectionKey, title] of SECTION_HEADERS) {
        const lineIdx = findSectionLine(doc, sectionKey);
        if (lineIdx === null) { continue; }

        const existing = findExistingSectionHeader(doc, lineIdx);
        const text = formatSectionHeader(title);

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

/** Find the line number of a top-level section in pubspec. */
function findSectionLine(
    doc: vscode.TextDocument,
    sectionKey: string,
): number | null {
    const pattern = new RegExp(`^${escapeRegExp(sectionKey)}\\s*$`);
    for (let i = 0; i < doc.lineCount; i++) {
        if (pattern.test(doc.lineAt(i).text)) { return i; }
    }
    return null;
}

/**
 * Detect existing section header block above a section.
 * Looks for the decorative comment pattern with hash borders.
 */
function findExistingSectionHeader(
    doc: vscode.TextDocument,
    sectionLine: number,
): { start: number; end: number } | null {
    let cursor = sectionLine - 1;
    if (cursor < 0) { return null; }

    while (cursor >= 0 && doc.lineAt(cursor).text.trim() === '') {
        cursor--;
    }
    if (cursor < 0) { return null; }

    const bottomBorder = doc.lineAt(cursor).text;
    if (!bottomBorder.match(/^\s*#{30,}/)) { return null; }

    const endLine = cursor + 1;
    cursor--;

    while (cursor >= 0) {
        const line = doc.lineAt(cursor).text;
        if (line.trim() === '' || line.trim() === '#') {
            cursor--;
            continue;
        }
        if (line.match(/^\s*#{30,}/)) {
            return { start: cursor, end: endLine };
        }
        if (!line.match(/^\s*#/)) {
            break;
        }
        cursor--;
    }

    return null;
}

/** Format a decorative section header block. */
export function formatSectionHeader(title: string): string {
    const hashLine = '#'.repeat(98);
    const leftHashes = '##########################';
    const rightHashes = '#####################################';
    const middleWidth = 35;

    const spacerLine = leftHashes + ' '.repeat(middleWidth) + rightHashes;

    const paddedTitle = title.padStart(
        Math.floor((middleWidth + title.length) / 2),
    ).padEnd(middleWidth);
    const titleLine = leftHashes + paddedTitle + rightHashes;

    const blankLines = Array(9).fill('#').join('\n  ');

    return [
        '',
        `  ${blankLines}`,
        `  ${hashLine}`,
        `  ${spacerLine}`,
        `  ${titleLine}`,
        `  ${spacerLine}`,
        `  ${hashLine}`,
        '',
    ].join('\n');
}

/** Build edits for sub-section headers (e.g. assets: within flutter:). */
export function buildSubSectionHeaderEdits(
    doc: vscode.TextDocument,
): SectionHeaderEdit[] {
    const edits: SectionHeaderEdit[] = [];

    for (const [subKey, { parent, title }] of SUB_SECTION_HEADERS) {
        const lineIdx = findSubSectionLine(doc, parent, subKey);
        if (lineIdx === null) { continue; }

        const existing = findExistingSectionHeader(doc, lineIdx);
        const text = formatSectionHeader(title);

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

/** Find a sub-section line within a parent section. */
function findSubSectionLine(
    doc: vscode.TextDocument,
    parentKey: string,
    subKey: string,
): number | null {
    const parentPattern = new RegExp(`^${escapeRegExp(parentKey)}\\s*$`);
    const subPattern = new RegExp(`^\\s{2}${escapeRegExp(subKey)}\\s*$`);

    let inParent = false;
    for (let i = 0; i < doc.lineCount; i++) {
        const line = doc.lineAt(i).text;

        if (parentPattern.test(line)) {
            inParent = true;
            continue;
        }

        if (inParent) {
            if (/^\S/.test(line) && !line.trim().startsWith('#')) {
                inParent = false;
                continue;
            }
            if (subPattern.test(line)) {
                return i;
            }
        }
    }

    return null;
}

/**
 * Build edit to insert "DEP OVERRIDDEN BELOW" marker above the first
 * dependency that has a corresponding override.
 */
export function buildOverrideMarkerEdit(
    doc: vscode.TextDocument,
    directDeps: string[],
    overrides: string[],
): SectionHeaderEdit | null {
    if (overrides.length === 0) { return null; }

    const overrideSet = new Set(overrides);
    const overriddenDeps = directDeps.filter(d => overrideSet.has(d));
    if (overriddenDeps.length === 0) { return null; }

    let firstOverriddenLine: number | null = null;
    const depPattern = /^\s{2}(\w[\w_]*)\s*:/;

    let inDeps = false;
    for (let i = 0; i < doc.lineCount; i++) {
        const line = doc.lineAt(i).text;

        if (/^dependencies\s*:/.test(line)) {
            inDeps = true;
            continue;
        }
        if (inDeps && /^\S/.test(line) && !line.trim().startsWith('#')) {
            break;
        }
        if (!inDeps) { continue; }

        const match = line.match(depPattern);
        if (match && overrideSet.has(match[1])) {
            firstOverriddenLine = i;
            break;
        }
    }

    if (firstOverriddenLine === null) { return null; }

    const existing = findExistingOverrideMarker(doc, firstOverriddenLine);
    const text = formatSectionHeader(OVERRIDE_MARKER_TITLE);

    if (existing) {
        return {
            insertPos: new vscode.Position(existing.start, 0),
            text,
            deleteRange: new vscode.Range(
                new vscode.Position(existing.start, 0),
                new vscode.Position(existing.end, 0),
            ),
        };
    }

    return {
        insertPos: new vscode.Position(firstOverriddenLine, 0),
        text,
    };
}

/**
 * Find existing override marker above a line.
 * Looks for the decorative header pattern containing "OVERRID".
 */
function findExistingOverrideMarker(
    doc: vscode.TextDocument,
    belowLine: number,
): { start: number; end: number } | null {
    let cursor = belowLine - 1;
    if (cursor < 0) { return null; }

    while (cursor >= 0 && doc.lineAt(cursor).text.trim() === '') {
        cursor--;
    }
    if (cursor < 0) { return null; }

    const bottomBorder = doc.lineAt(cursor).text;
    if (!bottomBorder.match(/^\s*#{30,}/)) { return null; }

    const endLine = cursor + 1;
    cursor--;

    let foundOverrideText = false;
    while (cursor >= 0) {
        const line = doc.lineAt(cursor).text;
        if (line.includes('OVERRID')) {
            foundOverrideText = true;
        }
        if (line.trim() === '' || line.trim() === '#') {
            cursor--;
            continue;
        }
        if (line.match(/^\s*#{30,}/)) {
            if (foundOverrideText) {
                return { start: cursor, end: endLine };
            }
            return null;
        }
        if (!line.match(/^\s*#/)) {
            break;
        }
        cursor--;
    }

    return null;
}
