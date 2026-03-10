import * as vscode from 'vscode';
import { CacheService } from './services/cache-service';
import { VibrancyTreeProvider } from './providers/tree-data-provider';
import { VibrancyDiagnostics } from './providers/diagnostics';
import { VibrancyCodeActionProvider } from './providers/code-action-provider';
import { VibrancyHoverProvider } from './providers/hover-provider';
import { VibrancyStatusBar } from './ui/status-bar';
import { VibrancyReportPanel } from './views/report-webview';
import { parsePubspecYaml, parsePubspecLock } from './services/pubspec-parser';
import { analyzePackage } from './scan-orchestrator';
import { PackageDependency, VibrancyResult } from './types';

let latestResults: VibrancyResult[] = [];
let scanInProgress = false;

/** Get the latest scan results (used by providers). */
export function getLatestResults(): readonly VibrancyResult[] {
    return latestResults;
}

/** Main activation wiring. */
export function runActivation(context: vscode.ExtensionContext): void {
    const cache = new CacheService(context.globalState);
    const treeProvider = new VibrancyTreeProvider();
    const hoverProvider = new VibrancyHoverProvider();
    const statusBar = new VibrancyStatusBar();
    const diagCollection = vscode.languages.createDiagnosticCollection(
        'saropa-vibrancy',
    );
    const diagnostics = new VibrancyDiagnostics(diagCollection);

    context.subscriptions.push(diagCollection, statusBar);

    const targets: ScanTargets = {
        tree: treeProvider, hover: hoverProvider,
        statusBar, diagnostics, cache,
    };

    registerTreeView(context, treeProvider);
    registerProviders(context, hoverProvider);
    registerCommands(context, targets);
    registerFileWatcher(context, targets);
    autoScanIfPubspec(targets);
}

function registerFileWatcher(
    context: vscode.ExtensionContext,
    targets: ScanTargets,
): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/pubspec.lock');
    watcher.onDidChange(() => runScan(targets));
    context.subscriptions.push(watcher);
}

function registerTreeView(
    context: vscode.ExtensionContext,
    provider: VibrancyTreeProvider,
): void {
    const tv = vscode.window.createTreeView(
        'saropaPackageVibrancy.packages',
        { treeDataProvider: provider },
    );
    context.subscriptions.push(tv);
}

function registerProviders(
    context: vscode.ExtensionContext,
    hoverProvider: VibrancyHoverProvider,
): void {
    const pubspecSelector = { language: 'yaml', pattern: '**/pubspec.yaml' };

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(pubspecSelector, hoverProvider),
    );
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            pubspecSelector,
            new VibrancyCodeActionProvider(),
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
        ),
    );
}

interface ScanTargets {
    tree: VibrancyTreeProvider;
    hover: VibrancyHoverProvider;
    statusBar: VibrancyStatusBar;
    diagnostics: VibrancyDiagnostics;
    cache: CacheService;
}

function registerCommands(
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
            () => VibrancyReportPanel.createOrShow(latestResults),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.clearCache',
            async () => {
                await targets.cache.clear();
                vscode.window.showInformationMessage('Vibrancy cache cleared');
            },
        ),
    );
}

async function autoScanIfPubspec(targets: ScanTargets): Promise<void> {
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    if (!config.get<boolean>('scanOnOpen', true)) { return; }

    const files = await vscode.workspace.findFiles(
        '**/pubspec.yaml', '**/.*/**', 1,
    );
    if (files.length > 0) {
        await runScan(targets);
    }
}

async function runScan(targets: ScanTargets): Promise<void> {
    if (scanInProgress) { return; }
    scanInProgress = true;
    try {
        await runScanInner(targets);
    } finally {
        scanInProgress = false;
    }
}

async function runScanInner(targets: ScanTargets): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Scanning package vibrancy...',
            cancellable: false,
        },
        async (progress) => {
            const parsed = await findAndParseDeps();
            if (!parsed) {
                vscode.window.showWarningMessage(
                    'No pubspec.yaml/pubspec.lock found in workspace',
                );
                return;
            }

            const config = vscode.workspace.getConfiguration(
                'saropaPackageVibrancy',
            );
            const token = config.get<string>('githubToken', '');

            const results: VibrancyResult[] = [];
            for (let i = 0; i < parsed.deps.length; i++) {
                progress.report({
                    message: `${parsed.deps[i].name} (${i + 1}/${parsed.deps.length})`,
                    increment: 100 / parsed.deps.length,
                });
                const result = await analyzePackage(parsed.deps[i], {
                    cache: targets.cache,
                    githubToken: token || undefined,
                });
                results.push(result);
            }

            latestResults = results;

            targets.tree.updateResults(results);
            targets.hover.updateResults(results);
            targets.statusBar.update(results);
            targets.diagnostics.update(
                parsed.yamlUri, parsed.yamlContent, results,
            );
        },
    );
}

interface ParsedDeps {
    deps: PackageDependency[];
    yamlUri: vscode.Uri;
    yamlContent: string;
}

async function findAndParseDeps(): Promise<ParsedDeps | null> {
    const yamlFiles = await vscode.workspace.findFiles(
        '**/pubspec.yaml', '**/.*/**', 1,
    );
    const lockFiles = await vscode.workspace.findFiles(
        '**/pubspec.lock', '**/.*/**', 1,
    );
    if (yamlFiles.length === 0 || lockFiles.length === 0) { return null; }

    const yamlBytes = await vscode.workspace.fs.readFile(yamlFiles[0]);
    const lockBytes = await vscode.workspace.fs.readFile(lockFiles[0]);

    const yamlContent = Buffer.from(yamlBytes).toString('utf8');
    const lockContent = Buffer.from(lockBytes).toString('utf8');

    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const includeDevDeps = config.get<boolean>('includeDevDependencies', false);

    const { directDeps, devDeps } = parsePubspecYaml(yamlContent);
    const allDirect = includeDevDeps ? [...directDeps, ...devDeps] : directDeps;
    const deps = parsePubspecLock(lockContent, allDirect)
        .filter(d => d.isDirect && d.source === 'hosted');

    return { deps, yamlUri: yamlFiles[0], yamlContent };
}
