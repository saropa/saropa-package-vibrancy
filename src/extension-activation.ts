import * as vscode from 'vscode';
import { CacheService } from './services/cache-service';
import { VibrancyTreeProvider } from './providers/tree-data-provider';
import { VibrancyDiagnostics } from './providers/diagnostics';
import { VibrancyCodeActionProvider } from './providers/code-action-provider';
import { VibrancyCodeLensProvider } from './providers/codelens-provider';
import { VibrancyHoverProvider } from './providers/hover-provider';
import { VibrancyStatusBar } from './ui/status-bar';
import { VibrancyReportPanel } from './views/report-webview';
import { KnownIssuesPanel } from './views/known-issues-webview';
import { AboutPanel } from './views/about-webview';
import { exportReports, ReportMetadata } from './services/report-exporter';
import { ScanLogger } from './services/scan-logger';
import { VibrancyResult } from './types';
import { countByCategory } from './scoring/status-classifier';
import { registerTreeCommands } from './providers/tree-commands';
import { registerUpgradeCommand } from './providers/upgrade-command';
import { readScanConfig, scanPackages, buildScanMeta, ParsedDeps, findAndParseDeps } from './scan-helpers';
import { scanDartImports } from './services/import-scanner';
import { detectUnused } from './scoring/unused-detector';
import { fetchFlutterReleases } from './services/flutter-releases';
import { snapshotVersions, notifyLockDiff } from './services/lock-diff-notifier';
import { detectFamilySplits } from './scoring/family-conflict-detector';

let latestResults: VibrancyResult[] = [];
let lastParsedDeps: ParsedDeps | null = null;
let scanInProgress = false;
let lastScanMeta: ReportMetadata = {
    flutterVersion: 'unknown',
    dartVersion: 'unknown',
    executionTimeMs: 0,
};

/** Get the latest scan results (used by providers). */
export function getLatestResults(): readonly VibrancyResult[] {
    return latestResults;
}

/** Main activation wiring. */
export function runActivation(context: vscode.ExtensionContext): void {
    const cache = new CacheService(context.globalState);
    const treeProvider = new VibrancyTreeProvider();
    const hoverProvider = new VibrancyHoverProvider();
    const codeLensProvider = new VibrancyCodeLensProvider();
    const statusBar = new VibrancyStatusBar();
    const diagCollection = vscode.languages.createDiagnosticCollection(
        'saropa-vibrancy',
    );
    const diagnostics = new VibrancyDiagnostics(diagCollection);

    context.subscriptions.push(diagCollection, statusBar);

    const targets: ScanTargets = {
        tree: treeProvider, hover: hoverProvider,
        codeLens: codeLensProvider, statusBar, diagnostics, cache,
    };

    registerTreeView(context, treeProvider);
    registerProviders(context, hoverProvider, codeLensProvider);
    registerCommands(context, targets);
    registerTreeCommands(context);
    registerUpgradeCommand(context);
    registerFileWatcher(context, targets);
    registerSuppressListener(context, targets);
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

function registerSuppressListener(
    context: vscode.ExtensionContext,
    targets: ScanTargets,
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration('saropaPackageVibrancy.suppressedPackages')) {
                return;
            }
            targets.tree.refresh();
            if (lastParsedDeps && latestResults.length > 0) {
                republishFiltered(targets, latestResults, lastParsedDeps);
            }
        }),
    );
}

function registerTreeView(
    context: vscode.ExtensionContext,
    provider: VibrancyTreeProvider,
): void {
    const tv = vscode.window.createTreeView(
        'saropaPackageVibrancy.packages',
        { treeDataProvider: provider },
    );
    tv.description = `v${context.extension.packageJSON.version}`;
    context.subscriptions.push(tv);
}

function registerProviders(
    context: vscode.ExtensionContext,
    hoverProvider: VibrancyHoverProvider,
    codeLensProvider: VibrancyCodeLensProvider,
): void {
    const pubspecSelector = { language: 'yaml', pattern: '**/pubspec.yaml' };

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(pubspecSelector, hoverProvider),
        vscode.languages.registerCodeActionsProvider(
            pubspecSelector,
            new VibrancyCodeActionProvider(),
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
        ),
        vscode.languages.registerCodeLensProvider(
            pubspecSelector, codeLensProvider,
        ),
    );
}

interface ScanTargets {
    tree: VibrancyTreeProvider;
    hover: VibrancyHoverProvider;
    codeLens: VibrancyCodeLensProvider;
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
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.exportReport',
            () => exportScanReport(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.browseKnownIssues',
            () => KnownIssuesPanel.createOrShow(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.about',
            () => AboutPanel.createOrShow(
                context.extension.packageJSON.version,
            ),
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
            const startTime = Date.now();
            const oldVersions = snapshotVersions(latestResults);

            const parsed = await findAndParseDeps();
            if (!parsed) {
                vscode.window.showWarningMessage(
                    'No pubspec.yaml/pubspec.lock found in workspace',
                );
                return;
            }

            const logger = new ScanLogger();
            const flutterReleases = await fetchFlutterReleases(
                targets.cache, logger,
            );
            const scanConfig = {
                ...readScanConfig(), logger, flutterReleases,
            };
            const deps = parsed.deps.filter(
                d => !scanConfig.allowSet.has(d.name),
            );
            logger.info(`Scan started — ${deps.length} packages`);

            const rawResults = await scanPackages(
                deps, targets.cache, scanConfig, progress,
            );

            progress.report({ message: 'Scanning imports...' });
            const workspaceRoot = vscode.Uri.joinPath(parsed.yamlUri, '..');
            const imported = await scanDartImports(workspaceRoot);
            const unusedNames = new Set(detectUnused(
                deps.map(d => d.name), imported,
            ));
            const results = rawResults.map(r =>
                unusedNames.has(r.package.name)
                    ? { ...r, isUnused: true } : r,
            );

            latestResults = results;
            lastParsedDeps = parsed;
            lastScanMeta = await buildScanMeta(startTime);

            const counts = countByCategory(results);
            logger.info(
                `Scan complete — ${logger.elapsedMs}ms — ` +
                `vibrant:${counts.vibrant} quiet:${counts.quiet} ` +
                `legacy:${counts.legacy} eol:${counts.eol}`,
            );

            publishResults(targets, results, parsed);
            notifyLockDiff(oldVersions, results);

            try {
                await logger.writeToFile();
            } catch {
                // Log write is best-effort — never block scan results
            }
        },
    );
}

function getSuppressedSet(): Set<string> {
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    return new Set(config.get<string[]>('suppressedPackages', []));
}

function publishResults(
    targets: ScanTargets,
    results: VibrancyResult[],
    parsed: ParsedDeps,
): void {
    const suppressed = getSuppressedSet();
    const active = results.filter(r => !suppressed.has(r.package.name));
    const splits = detectFamilySplits(active);
    targets.tree.updateResults(results);
    targets.tree.updateFamilySplits(splits);
    targets.hover.updateResults(active);
    targets.hover.updateFamilySplits(splits);
    targets.codeLens.updateResults(active);
    targets.statusBar.update(results);
    targets.diagnostics.updateFamilySplits(splits);
    targets.diagnostics.update(parsed.yamlUri, parsed.yamlContent, active);
}

function republishFiltered(
    targets: ScanTargets,
    results: VibrancyResult[],
    parsed: ParsedDeps,
): void {
    const suppressed = getSuppressedSet();
    const active = results.filter(r => !suppressed.has(r.package.name));
    const splits = detectFamilySplits(active);
    targets.tree.updateFamilySplits(splits);
    targets.hover.updateResults(active);
    targets.hover.updateFamilySplits(splits);
    targets.codeLens.updateResults(active);
    targets.diagnostics.updateFamilySplits(splits);
    targets.diagnostics.update(parsed.yamlUri, parsed.yamlContent, active);
}

async function exportScanReport(): Promise<void> {
    if (latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }

    const files = await exportReports(latestResults, lastScanMeta);
    if (files.length > 0) {
        vscode.window.showInformationMessage(
            `Reports saved: ${files.length} files`,
        );
    }
}

