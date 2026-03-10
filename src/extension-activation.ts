import * as vscode from 'vscode';
import { CacheService } from './services/cache-service';
import { VibrancyTreeProvider } from './providers/tree-data-provider';
import { VibrancyDiagnostics } from './providers/diagnostics';
import { VibrancyCodeActionProvider } from './providers/code-action-provider';
import { VibrancyHoverProvider } from './providers/hover-provider';
import { VibrancyStatusBar } from './ui/status-bar';
import { VibrancyReportPanel } from './views/report-webview';
import { KnownIssuesPanel } from './views/known-issues-webview';
import { parsePubspecYaml, parsePubspecLock } from './services/pubspec-parser';
import { analyzePackage } from './scan-orchestrator';
import { exportReports, ReportMetadata } from './services/report-exporter';
import { detectDartVersion, detectFlutterVersion } from './services/sdk-detector';
import { PackageDependency, VibrancyResult } from './types';
import { ScoringWeights } from './scoring/vibrancy-calculator';
import { registerTreeCommands } from './providers/tree-commands';

let latestResults: VibrancyResult[] = [];
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
    registerTreeCommands(context);
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
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.exportReport',
            () => exportScanReport(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.browseKnownIssues',
            () => KnownIssuesPanel.createOrShow(),
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

            const parsed = await findAndParseDeps();
            if (!parsed) {
                vscode.window.showWarningMessage(
                    'No pubspec.yaml/pubspec.lock found in workspace',
                );
                return;
            }

            const scanConfig = readScanConfig();
            const deps = parsed.deps.filter(
                d => !scanConfig.allowSet.has(d.name),
            );
            const results = await scanPackages(
                deps, targets.cache, scanConfig, progress,
            );

            latestResults = results;
            lastScanMeta = await buildScanMeta(startTime);
            publishResults(targets, results, parsed);
        },
    );
}

interface ScanConfig {
    readonly token: string;
    readonly allowSet: Set<string>;
    readonly weights: ScoringWeights;
    readonly repoOverrides: Record<string, string>;
}

function readScanConfig(): ScanConfig {
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    return {
        token: config.get<string>('githubToken', ''),
        allowSet: new Set(config.get<string[]>('allowlist', [])),
        weights: {
            resolutionVelocity: config.get<number>('weights.resolutionVelocity', 0.5),
            engagementLevel: config.get<number>('weights.engagementLevel', 0.4),
            popularity: config.get<number>('weights.popularity', 0.1),
        },
        repoOverrides: config.get<Record<string, string>>('repoOverrides', {}),
    };
}

async function scanPackages(
    deps: PackageDependency[],
    cache: CacheService,
    scanConfig: ScanConfig,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<VibrancyResult[]> {
    const results: VibrancyResult[] = [];
    for (let i = 0; i < deps.length; i++) {
        progress.report({
            message: `${deps[i].name} (${i + 1}/${deps.length})`,
            increment: 100 / deps.length,
        });
        const result = await analyzePackage(deps[i], {
            cache,
            githubToken: scanConfig.token || undefined,
            weights: scanConfig.weights,
            repoOverrides: scanConfig.repoOverrides,
        });
        results.push(result);
    }
    return results;
}

async function buildScanMeta(startTime: number): Promise<ReportMetadata> {
    const [flutterVer, dartVer] = await Promise.all([
        detectFlutterVersion(), detectDartVersion(),
    ]);
    return {
        flutterVersion: flutterVer,
        dartVersion: dartVer,
        executionTimeMs: Date.now() - startTime,
    };
}

function publishResults(
    targets: ScanTargets,
    results: VibrancyResult[],
    parsed: ParsedDeps,
): void {
    targets.tree.updateResults(results);
    targets.hover.updateResults(results);
    targets.statusBar.update(results);
    targets.diagnostics.update(
        parsed.yamlUri, parsed.yamlContent, results,
    );
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

interface ParsedDeps {
    deps: PackageDependency[];
    yamlUri: vscode.Uri;
    yamlContent: string;
}

async function findAndParseDeps(): Promise<ParsedDeps | null> {
    const [yamlFiles, lockFiles] = await Promise.all([
        vscode.workspace.findFiles('**/pubspec.yaml', '**/.*/**', 1),
        vscode.workspace.findFiles('**/pubspec.lock', '**/.*/**', 1),
    ]);
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
