import * as vscode from 'vscode';
import { CacheService } from './services/cache-service';
import { VibrancyTreeProvider } from './providers/tree-data-provider';
import { VibrancyDiagnostics } from './providers/diagnostics';
import { VibrancyCodeActionProvider } from './providers/code-action-provider';
import { VibrancyCodeLensProvider, setCodeLensToggle } from './providers/codelens-provider';
import { VibrancyHoverProvider } from './providers/hover-provider';
import { VibrancyStatusBar } from './ui/status-bar';
import { CodeLensToggle } from './ui/codelens-toggle';
import { VibrancyReportPanel } from './views/report-webview';
import { KnownIssuesPanel } from './views/known-issues-webview';
import { AboutPanel } from './views/about-webview';
import { DetailViewProvider, DETAIL_VIEW_ID } from './views/detail-view-provider';
import { DetailLogger, DETAIL_CHANNEL_NAME } from './services/detail-logger';
import { exportReports, ReportMetadata } from './services/report-exporter';
import { exportSbomReport } from './services/sbom-exporter';
import { ScanLogger } from './services/scan-logger';
import { VibrancyResult } from './types';
import { countByCategory } from './scoring/status-classifier';
import { registerTreeCommands } from './providers/tree-commands';
import { registerUpgradeCommand } from './providers/upgrade-command';
import { registerAnnotateCommand } from './providers/annotate-command';
import { readScanConfig, scanPackages, buildScanMeta, ParsedDeps, findAndParseDeps } from './scan-helpers';
import { scanDartImports } from './services/import-scanner';
import { detectUnused } from './scoring/unused-detector';
import { fetchFlutterReleases } from './services/flutter-releases';
import { snapshotVersions, notifyLockDiff } from './services/lock-diff-notifier';
import { detectFamilySplits } from './scoring/family-conflict-detector';
import { AdoptionGateProvider } from './providers/adoption-gate';
import { enrichWithBlockers } from './services/blocker-enricher';
import { buildUpgradeOrder, setOverrideAnalyses } from './scoring/upgrade-sequencer';
import { executeUpgradePlan, formatUpgradePlan, formatUpgradeReport } from './services/upgrade-executor';
import { fetchDepGraph, buildReverseDeps } from './services/dep-graph';
import { parseDependencyOverrides } from './services/pubspec-parser';
import {
    countTransitives, findSharedDeps, enrichTransitiveInfo, buildDepGraphSummary,
    calcTransitiveRiskPenalty,
} from './scoring/transitive-analyzer';
import { allKnownIssues } from './scoring/known-issues';
import { runOverrideAnalysis } from './services/override-runner';
import { OverrideAnalysis, NewVersionNotification, PackageInsight } from './types';
import { consolidateInsights } from './scoring/consolidate-insights';
import {
    FreshnessWatcher, formatNotificationMessage, createNotificationActions,
} from './services/freshness-watcher';
import {
    addSuppressedPackage, addSuppressedPackages, clearSuppressedPackages,
} from './services/config-service';
import { sortDependencies } from './services/pubspec-sorter';
import { clearIndicatorCache } from './services/indicator-config';
import { findPubspecYaml } from './services/pubspec-editor';
import { VibrancyStateManager } from './state';

let latestResults: VibrancyResult[] = [];
let lastParsedDeps: ParsedDeps | null = null;
let lastReverseDeps: ReadonlyMap<string, readonly import('./types').DepEdge[]> | null = null;
let lastOverrideAnalyses: OverrideAnalysis[] = [];
let lastInsights: PackageInsight[] = [];
let lastScanMeta: ReportMetadata = {
    flutterVersion: 'unknown',
    dartVersion: 'unknown',
    executionTimeMs: 0,
};
let freshnessWatcher: FreshnessWatcher | null = null;
let stateManager: VibrancyStateManager | null = null;
let detailViewProvider: DetailViewProvider | null = null;
let detailLogger: DetailLogger | null = null;
let detailChannel: vscode.OutputChannel | null = null;

/** Get the latest scan results (used by providers). */
export function getLatestResults(): readonly VibrancyResult[] {
    return latestResults;
}

/** Get the latest consolidated insights (used by providers). */
export function getLatestInsights(): readonly PackageInsight[] {
    return lastInsights;
}

/** Get the vibrancy state manager (used by providers). */
export function getStateManager(): VibrancyStateManager | null {
    return stateManager;
}

/** Main activation wiring. */
export function runActivation(context: vscode.ExtensionContext): void {
    const cache = new CacheService(context.globalState);
    const treeProvider = new VibrancyTreeProvider();
    const hoverProvider = new VibrancyHoverProvider();
    const codeLensProvider = new VibrancyCodeLensProvider();
    const codeLensToggle = new CodeLensToggle();
    const statusBar = new VibrancyStatusBar();
    const diagCollection = vscode.languages.createDiagnosticCollection(
        'saropa-vibrancy',
    );
    const diagnostics = new VibrancyDiagnostics(diagCollection);

    stateManager = new VibrancyStateManager();

    setCodeLensToggle(codeLensToggle);
    codeLensToggle.onDidChange(enabled => {
        if (stateManager) {
            stateManager.codeLensEnabled.value = enabled;
        }
        codeLensProvider.refresh();
    });

    context.subscriptions.push(diagCollection, statusBar, codeLensToggle, stateManager);

    const adoptionGate = new AdoptionGateProvider(cache);
    adoptionGate.register(context);

    const codeActionProvider = new VibrancyCodeActionProvider();

    freshnessWatcher = new FreshnessWatcher(cache);
    freshnessWatcher.setOnNewVersions(handleNewVersions);

    const targets: ScanTargets = {
        tree: treeProvider, hover: hoverProvider,
        codeLens: codeLensProvider, codeActions: codeActionProvider,
        statusBar, diagnostics, cache, adoptionGate, codeLensToggle,
        state: stateManager,
    };

    detailViewProvider = new DetailViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DETAIL_VIEW_ID, detailViewProvider),
    );

    detailChannel = vscode.window.createOutputChannel(DETAIL_CHANNEL_NAME);
    detailLogger = new DetailLogger(detailChannel);
    context.subscriptions.push(detailChannel);

    registerTreeView(context, treeProvider);
    registerProviders(context, hoverProvider, codeLensProvider, codeActionProvider);
    registerCommands(context, targets);
    registerTreeCommands(context, detailViewProvider, detailLogger);
    registerUpgradeCommand(context);
    registerAnnotateCommand(context);
    registerFileWatcher(context, targets);
    registerSuppressListener(context, targets);
    registerConfigListener(context, codeLensProvider);
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
                updateFilteredTargets(targets, latestResults, lastParsedDeps);
            }
        }),
    );
}

function registerConfigListener(
    context: vscode.ExtensionContext,
    codeLensProvider: VibrancyCodeLensProvider,
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('saropaPackageVibrancy.indicators')
                || e.affectsConfiguration('saropaPackageVibrancy.indicatorStyle')) {
                clearIndicatorCache();
                codeLensProvider.refresh();
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

    tv.onDidChangeSelection(e => {
        if (!detailViewProvider) { return; }
        if (e.selection.length === 1 && 'result' in e.selection[0]) {
            const item = e.selection[0] as { result: VibrancyResult };
            detailViewProvider.update(item.result);
        } else {
            detailViewProvider.clear();
        }
    });
}

function registerProviders(
    context: vscode.ExtensionContext,
    hoverProvider: VibrancyHoverProvider,
    codeLensProvider: VibrancyCodeLensProvider,
    codeActionProvider: VibrancyCodeActionProvider,
): void {
    const pubspecSelector = { language: 'yaml', pattern: '**/pubspec.yaml' };

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(pubspecSelector, hoverProvider),
        vscode.languages.registerCodeActionsProvider(
            pubspecSelector,
            codeActionProvider,
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
    codeActions: VibrancyCodeActionProvider;
    statusBar: VibrancyStatusBar;
    diagnostics: VibrancyDiagnostics;
    cache: CacheService;
    adoptionGate: AdoptionGateProvider;
    codeLensToggle: CodeLensToggle;
    state: VibrancyStateManager;
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
            () => requireResults(
                r => exportReports(r, lastScanMeta).then(f => f.length || null),
                n => `Reports saved: ${n} files`,
            ),
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
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.exportSbom',
            () => requireResults(
                r => exportSbomReport(r, context.extension.packageJSON.version),
                p => `SBOM exported: ${p}`,
            ),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.planUpgrades',
            () => planAndExecuteUpgrades(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.goToOverride',
            (packageName: string) => goToOverride(packageName),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.suppressPackageByName',
            (packageName: string) => suppressPackageByName(packageName, targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.suppressByCategory',
            () => suppressByCategory(targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.suppressAllProblems',
            () => suppressAllProblems(targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.unsuppressAll',
            () => unsuppressAll(targets),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.sortDependencies',
            () => runSortDependencies(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.showCodeLens',
            () => targets.codeLensToggle.show(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.hideCodeLens',
            () => targets.codeLensToggle.hide(),
        ),
        vscode.commands.registerCommand(
            'saropaPackageVibrancy.toggleCodeLens',
            () => targets.codeLensToggle.toggle(),
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
    if (targets.state.isScanning.value) { return; }
    targets.state.startScanning();
    try {
        await runScanInner(targets);
    } finally {
        targets.state.stopScanning();
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
            const withUnused = rawResults.map(r =>
                unusedNames.has(r.package.name)
                    ? { ...r, isUnused: true, alternatives: [] } : r,
            );

            progress.report({ message: 'Analyzing upgrade blockers...' });
            const enrichResult = await enrichWithBlockers(
                withUnused, workspaceRoot.fsPath, logger,
            );
            let results = enrichResult.results;
            lastReverseDeps = enrichResult.reverseDeps;

            progress.report({ message: 'Analyzing dependency graph...' });
            const depGraph = await fetchDepGraph(workspaceRoot.fsPath);
            let depGraphSummary: import('./types').DepGraphSummary | null = null;
            if (depGraph.success && depGraph.packages.length > 0) {
                const directDeps = deps.filter(d => d.isDirect).map(d => d.name);
                const overrides = parseDependencyOverrides(parsed.yamlContent);
                const knownIssuesMap = allKnownIssues();

                const transitiveInfos = countTransitives(directDeps, depGraph.packages);
                const sharedDeps = findSharedDeps(directDeps, depGraph.packages);
                const enrichedInfos = enrichTransitiveInfo(
                    transitiveInfos, sharedDeps, knownIssuesMap,
                );

                const transitiveMap = new Map(
                    enrichedInfos.map((t): [string, import('./types').TransitiveInfo] => [t.directDep, t]),
                );
                results = results.map(r => {
                    const tInfo = transitiveMap.get(r.package.name) ?? null;
                    if (!tInfo) { return r; }
                    const penalty = calcTransitiveRiskPenalty(tInfo);
                    const adjustedScore = Math.max(0, r.score - penalty);
                    return { ...r, transitiveInfo: tInfo, score: adjustedScore };
                }) as VibrancyResult[];

                depGraphSummary = buildDepGraphSummary(
                    directDeps, depGraph.packages, overrides.length,
                );
                logger.info(
                    `Dep graph: ${depGraphSummary!.directCount} direct, ` +
                    `${depGraphSummary!.transitiveCount} transitive, ` +
                    `${overrides.length} overrides`,
                );
            }

            progress.report({ message: 'Analyzing overrides...' });
            const overrideAnalyses = await runOverrideAnalysis(
                parsed.yamlContent,
                deps,
                depGraph.success ? depGraph.packages : [],
                workspaceRoot.fsPath,
                logger,
            );
            lastOverrideAnalyses = overrideAnalyses;
            if (overrideAnalyses.length > 0) {
                const staleCount = overrideAnalyses.filter(a => a.status === 'stale').length;
                logger.info(
                    `Overrides: ${overrideAnalyses.length} total, ${staleCount} stale`,
                );
            }

            latestResults = results;
            lastParsedDeps = parsed;
            lastScanMeta = await buildScanMeta(startTime);

            const counts = countByCategory(results);
            logger.info(
                `Scan complete — ${logger.elapsedMs}ms — ` +
                `vibrant:${counts.vibrant} quiet:${counts.quiet} ` +
                `legacy:${counts.legacy} eol:${counts.eol}`,
            );

            publishResults(targets, results, parsed, depGraphSummary);
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
    depGraphSummary: import('./types').DepGraphSummary | null = null,
): void {
    targets.adoptionGate.clearDecorations();
    targets.tree.updateResults(results);
    targets.tree.updateDepGraphSummary(depGraphSummary);
    targets.tree.updateOverrideAnalyses(lastOverrideAnalyses);
    targets.state.updateFromResults(results);
    updateFilteredTargets(targets, results, parsed);

    freshnessWatcher?.start(results);
}

function updateFilteredTargets(
    targets: ScanTargets,
    results: VibrancyResult[],
    parsed: ParsedDeps,
): void {
    const suppressed = getSuppressedSet();
    const active = results.filter(r => !suppressed.has(r.package.name));
    const splits = detectFamilySplits(active);

    lastInsights = consolidateInsights(active, lastOverrideAnalyses, splits);

    targets.tree.updateFamilySplits(splits);
    targets.tree.updateInsights(lastInsights);
    targets.hover.updateResults(active);
    targets.hover.updateFamilySplits(splits);
    targets.hover.updateInsights(lastInsights);
    targets.codeLens.updateResults(active);
    targets.codeActions.updateResults(active);
    targets.diagnostics.updateFamilySplits(splits);
    targets.diagnostics.updateOverrideAnalyses(lastOverrideAnalyses);
    targets.diagnostics.update(parsed.yamlUri, parsed.yamlContent, active);
    targets.statusBar.update(results, lastInsights);
}

let upgradeChannel: vscode.OutputChannel | null = null;

async function planAndExecuteUpgrades(): Promise<void> {
    if (latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }

    if (!upgradeChannel) {
        upgradeChannel = vscode.window.createOutputChannel(
            'Saropa: Upgrade Plan',
        );
    }
    upgradeChannel.clear();

    setOverrideAnalyses(lastOverrideAnalyses);
    const reverseDeps = lastReverseDeps ?? new Map();
    const steps = buildUpgradeOrder(latestResults, reverseDeps);
    if (steps.length === 0) {
        vscode.window.showInformationMessage(
            'No upgradable packages found',
        );
        return;
    }

    upgradeChannel.appendLine(formatUpgradePlan(steps));
    upgradeChannel.show(true);

    const choice = await vscode.window.showInformationMessage(
        `Proceed with ${steps.length} upgrade(s)? Stop on first failure.`,
        'Execute', 'Cancel',
    );
    if (choice !== 'Execute') { return; }

    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const report = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Executing upgrade plan...',
            cancellable: false,
        },
        () => executeUpgradePlan(steps, upgradeChannel!, {
            skipTests: config.get<boolean>('upgradeSkipTests', false),
            maxSteps: config.get<number>('upgradeMaxSteps', 20),
        }),
    );

    upgradeChannel.appendLine('\n' + formatUpgradeReport(report));
    upgradeChannel.show(true);

    if (report.failedAt) {
        vscode.window.showWarningMessage(
            `Upgrade stopped at ${report.failedAt} — ${report.completedCount}/${steps.length} completed`,
        );
    } else {
        vscode.window.showInformationMessage(
            `All ${report.completedCount} upgrades completed successfully`,
        );
    }
}

async function requireResults<T>(
    action: (results: VibrancyResult[]) => Promise<T | null>,
    successMsg: (result: T) => string,
): Promise<void> {
    if (latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }
    const result = await action(latestResults);
    if (result) {
        vscode.window.showInformationMessage(successMsg(result));
    }
}

async function goToOverride(packageName: string): Promise<void> {
    const analysis = lastOverrideAnalyses.find(a => a.entry.name === packageName);
    if (!analysis || !lastParsedDeps) { return; }

    const doc = await vscode.workspace.openTextDocument(lastParsedDeps.yamlUri);
    const editor = await vscode.window.showTextDocument(doc);

    const line = analysis.entry.line;
    const lineText = doc.lineAt(line).text;
    const match = lineText.match(/^\s{2}(\w[\w_]*)/);
    const startChar = match ? lineText.indexOf(match[1]) : 2;
    const endChar = match ? startChar + match[1].length : lineText.length;

    const range = new vscode.Range(line, startChar, line, endChar);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

async function handleNewVersions(
    notifications: NewVersionNotification[],
): Promise<void> {
    if (notifications.length === 0) { return; }

    const message = formatNotificationMessage(notifications);
    const actions = createNotificationActions();

    const choice = await vscode.window.showInformationMessage(
        message,
        ...actions,
    );

    switch (choice) {
        case 'View Details':
            vscode.commands.executeCommand('saropaPackageVibrancy.showReport');
            break;
        case 'Update All':
            vscode.commands.executeCommand('saropaPackageVibrancy.planUpgrades');
            break;
        case 'Dismiss':
            break;
    }
}

async function suppressPackageByName(
    packageName: string,
    targets: ScanTargets,
): Promise<void> {
    await addSuppressedPackage(packageName);
    vscode.window.showInformationMessage(
        `Suppressed "${packageName}" — diagnostics will be hidden`,
    );
    if (lastParsedDeps) {
        updateFilteredTargets(targets, latestResults, lastParsedDeps);
    }
}

async function suppressByCategory(targets: ScanTargets): Promise<void> {
    if (latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }

    const items: vscode.QuickPickItem[] = [
        {
            label: '$(warning) End of Life packages',
            description: `${countCategory('end-of-life')} packages`,
            detail: 'Suppress all packages marked as end-of-life',
        },
        {
            label: '$(info) Legacy-Locked packages',
            description: `${countCategory('legacy-locked')} packages`,
            detail: 'Suppress all packages marked as legacy-locked',
        },
        {
            label: '$(question) Quiet packages',
            description: `${countCategory('quiet')} packages`,
            detail: 'Suppress all packages with low activity',
        },
        {
            label: '$(circle-slash) All Blocked packages',
            description: `${countBlocked()} packages`,
            detail: 'Suppress packages that cannot be upgraded due to blockers',
        },
    ];

    const selection = await vscode.window.showQuickPick(items, {
        title: 'Suppress Packages by Category',
        placeHolder: 'Select which packages to suppress',
    });

    if (!selection) { return; }

    let toSuppress: string[] = [];
    if (selection.label.includes('End of Life')) {
        toSuppress = getPackagesByCategory('end-of-life');
    } else if (selection.label.includes('Legacy-Locked')) {
        toSuppress = getPackagesByCategory('legacy-locked');
    } else if (selection.label.includes('Quiet')) {
        toSuppress = getPackagesByCategory('quiet');
    } else if (selection.label.includes('Blocked')) {
        toSuppress = getBlockedPackages();
    }

    if (toSuppress.length === 0) {
        vscode.window.showInformationMessage('No packages to suppress');
        return;
    }

    const count = await addSuppressedPackages(toSuppress);
    vscode.window.showInformationMessage(
        `Suppressed ${count} package(s)`,
    );
    if (lastParsedDeps) {
        updateFilteredTargets(targets, latestResults, lastParsedDeps);
    }
}

async function suppressAllProblems(targets: ScanTargets): Promise<void> {
    if (latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }

    const unhealthy = latestResults
        .filter(r => r.category !== 'vibrant')
        .map(r => r.package.name);

    if (unhealthy.length === 0) {
        vscode.window.showInformationMessage('No unhealthy packages to suppress');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Suppress all ${unhealthy.length} unhealthy packages? This will hide all diagnostics.`,
        { modal: true },
        'Suppress All',
    );

    if (confirm !== 'Suppress All') { return; }

    const count = await addSuppressedPackages(unhealthy);
    vscode.window.showInformationMessage(`Suppressed ${count} package(s)`);
    if (lastParsedDeps) {
        updateFilteredTargets(targets, latestResults, lastParsedDeps);
    }
}

async function unsuppressAll(targets: ScanTargets): Promise<void> {
    const count = await clearSuppressedPackages();
    if (count === 0) {
        vscode.window.showInformationMessage('No suppressed packages');
        return;
    }
    vscode.window.showInformationMessage(`Unsuppressed ${count} package(s)`);
    if (lastParsedDeps) {
        updateFilteredTargets(targets, latestResults, lastParsedDeps);
    }
}

function countCategory(category: string): number {
    return latestResults.filter(r => r.category === category).length;
}

function countBlocked(): number {
    return latestResults.filter(r => r.blocker !== undefined).length;
}

function getPackagesByCategory(category: string): string[] {
    return latestResults
        .filter(r => r.category === category)
        .map(r => r.package.name);
}

function getBlockedPackages(): string[] {
    return latestResults
        .filter(r => r.blocker !== undefined)
        .map(r => r.package.name);
}

export function stopFreshnessWatcher(): void {
    freshnessWatcher?.stop();
}

async function runSortDependencies(): Promise<void> {
    const pubspecUri = await findPubspecYaml();
    if (!pubspecUri) {
        vscode.window.showWarningMessage('No pubspec.yaml found in workspace');
        return;
    }

    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const sdkFirst = config.get<boolean>('sortSdkFirst', true);

    const result = await sortDependencies(pubspecUri, { sdkFirst });

    if (!result.sorted) {
        vscode.window.showInformationMessage('Dependencies already sorted');
        return;
    }

    vscode.window.showInformationMessage(
        `Sorted ${result.entriesMoved} dependencies in ${result.sectionsModified.join(', ')}`,
    );
}

