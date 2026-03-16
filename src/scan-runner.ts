/** Scan pipeline: triggers, execution, result publishing, and UI updates. */
import * as vscode from 'vscode';
import { _state } from './activation-state';
import type { ScanTargets } from './extension-activation';
import { VibrancyResult, isUnusedRemovalEligibleSection, type DepGraphSummary, type TransitiveInfo, type PackageRange } from './types';
import { readScanConfig, scanPackages, buildScanMeta, findAndParseDeps, ParsedDeps } from './scan-helpers';
import { ScanLogger } from './services/scan-logger';
import { scanDartImports } from './services/import-scanner';
import { detectUnused } from './scoring/unused-detector';
import { fetchFlutterReleases } from './services/flutter-releases';
import { snapshotVersions, notifyLockDiff } from './services/lock-diff-notifier';
import { enrichWithBlockers } from './services/blocker-enricher';
import { fetchDepGraph } from './services/dep-graph';
import { parseDependencyOverrides, findPackageRange } from './services/pubspec-parser';
import {
    countTransitives, findSharedDeps, enrichTransitiveInfo,
    buildDepGraphSummary, calcTransitiveRiskPenalty,
} from './scoring/transitive-analyzer';
import { allKnownIssues } from './scoring/known-issues';
import { runOverrideAnalysis } from './services/override-runner';
import { consolidateInsights } from './scoring/consolidate-insights';
import { detectFamilySplits } from './scoring/family-conflict-detector';
import { queryVulnerabilities } from './services/osv-api';
import { queryGitHubAdvisories, mergeVulnerabilities } from './services/github-advisory-api';
import { getVulnScanEnabled, getGitHubAdvisoryEnabled, getGithubToken } from './services/config-service';
import { countByCategory } from './scoring/status-classifier';
import { readBudgetConfig, checkBudgets, formatBudgetSummary, hasBudgets } from './scoring/budget-checker';
import { collectProblemsFromResults, CollectorContext } from './problems';

/** Auto-scan on activation if a pubspec.yaml is present. */
export async function autoScanIfPubspec(targets: ScanTargets): Promise<void> {
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    if (!config.get<boolean>('scanOnOpen', true)) { return; }

    const files = await vscode.workspace.findFiles(
        '**/pubspec.yaml', '**/.*/**', 1,
    );
    if (files.length > 0) {
        await runScan(targets);
    }
}

/** Run a scan with guard against concurrent execution. */
export async function runScan(targets: ScanTargets): Promise<void> {
    if (targets.state.isScanning.value) { return; }
    targets.state.startScanning();
    try {
        await runScanInner(targets);
    } finally {
        targets.state.stopScanning();
    }
}

/** Core scan logic — fetches data, scores packages, enriches results. */
async function runScanInner(targets: ScanTargets): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Scanning package vibrancy...',
            cancellable: false,
        },
        async (progress) => {
            const startTime = Date.now();
            const oldVersions = snapshotVersions(_state.latestResults);

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
            // Only mark as unused when eligible for removal; dev_dependencies are used by tooling.
            const withUnused = rawResults.map(r =>
                unusedNames.has(r.package.name) && isUnusedRemovalEligibleSection(r.package.section)
                    ? { ...r, isUnused: true, alternatives: [] } : r,
            );

            progress.report({ message: 'Analyzing upgrade blockers...' });
            const enrichResult = await enrichWithBlockers(
                withUnused, workspaceRoot.fsPath, logger,
            );
            let results = enrichResult.results;
            _state.lastReverseDeps = enrichResult.reverseDeps;

            progress.report({ message: 'Analyzing dependency graph...' });
            const depGraph = await fetchDepGraph(workspaceRoot.fsPath);
            let depGraphSummary: DepGraphSummary | null = null;
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
                    enrichedInfos.map((t): [string, TransitiveInfo] => [t.directDep, t]),
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
            _state.lastOverrideAnalyses = overrideAnalyses;
            if (overrideAnalyses.length > 0) {
                const staleCount = overrideAnalyses.filter(a => a.status === 'stale').length;
                logger.info(
                    `Overrides: ${overrideAnalyses.length} total, ${staleCount} stale`,
                );
            }

            if (getVulnScanEnabled()) {
                progress.report({ message: 'Scanning for vulnerabilities...' });
                const vulnQueries = results.map(r => ({
                    name: r.package.name,
                    version: r.package.version,
                }));

                // Query OSV and GitHub Advisory in parallel for performance
                const [osvResults, ghsaResults] = await Promise.all([
                    queryVulnerabilities(vulnQueries, targets.cache, logger),
                    getGitHubAdvisoryEnabled()
                        ? queryGitHubAdvisories(
                            vulnQueries,
                            getGithubToken() || undefined,
                            targets.cache,
                            logger,
                        )
                        : Promise.resolve([]),
                ]);

                const osvMap = new Map(
                    osvResults.map(vr => [`${vr.name}@${vr.version}`, vr.vulnerabilities]),
                );
                const ghsaMap = new Map(
                    ghsaResults.map(vr => [`${vr.name}@${vr.version}`, vr.vulnerabilities]),
                );

                results = results.map(r => {
                    const key = `${r.package.name}@${r.package.version}`;
                    const osvVulns = osvMap.get(key) ?? [];
                    const ghsaVulns = ghsaMap.get(key) ?? [];
                    const merged = mergeVulnerabilities(osvVulns, ghsaVulns);
                    return merged.length > 0 ? { ...r, vulnerabilities: merged } : r;
                }) as VibrancyResult[];

                const vulnCount = results.filter(r => r.vulnerabilities.length > 0).length;
                if (vulnCount > 0) {
                    logger.info(`Vulnerabilities: ${vulnCount} package(s) affected`);
                }
            }

            _state.latestResults = results;
            _state.lastParsedDeps = parsed;
            _state.lastScanMeta = await buildScanMeta(startTime);

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

/** Distribute scan results to all UI providers and start freshness watcher. */
function publishResults(
    targets: ScanTargets,
    results: VibrancyResult[],
    parsed: ParsedDeps,
    depGraphSummary: DepGraphSummary | null = null,
): void {
    targets.adoptionGate.clearDecorations();
    targets.tree.updateResults(results);
    targets.tree.updateDepGraphSummary(depGraphSummary);
    targets.tree.updateOverrideAnalyses(_state.lastOverrideAnalyses);
    targets.state.updateFromResults(results);

    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const budgetConfig = readBudgetConfig(key => config.get(key));
    if (hasBudgets(budgetConfig)) {
        _state.lastBudgetResults = checkBudgets(results, budgetConfig);
        const budgetSummary = formatBudgetSummary(_state.lastBudgetResults);
        targets.tree.updateBudgetResults(_state.lastBudgetResults, budgetSummary);
        targets.diagnostics.updateBudgetResults(_state.lastBudgetResults);
    } else {
        _state.lastBudgetResults = [];
        targets.tree.updateBudgetResults([], '');
        targets.diagnostics.updateBudgetResults([]);
    }

    updateFilteredTargets(targets, results, parsed);
    _state.freshnessWatcher?.start(results);
}

/** Recompute filtered/suppressed results and push to all UI targets. */
export function updateFilteredTargets(
    targets: ScanTargets,
    results: VibrancyResult[],
    parsed: ParsedDeps,
): void {
    const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
    const suppressed = new Set(config.get<string[]>('suppressedPackages', []));
    const active = results.filter(r => !suppressed.has(r.package.name));
    const splits = detectFamilySplits(active);

    _state.lastInsights = consolidateInsights(active, _state.lastOverrideAnalyses, splits);

    // Build package ranges from YAML for problem collector
    const packageRanges = new Map<string, PackageRange>();
    for (const result of active) {
        const range = findPackageRange(parsed.yamlContent, result.package.name);
        if (range) { packageRanges.set(result.package.name, range); }
    }

    const collectorContext: CollectorContext = {
        packageRanges,
        overrideAnalyses: _state.lastOverrideAnalyses,
        familySplits: splits,
    };
    collectProblemsFromResults(active, collectorContext, _state.problemRegistry);

    if (_state.problemTreeProvider) {
        _state.problemTreeProvider.updateRegistry(_state.problemRegistry);
        const healthy = active.filter(
            r => _state.problemRegistry.getForPackage(r.package.name).length === 0,
        );
        _state.problemTreeProvider.setHealthyPackages(healthy);
    }

    targets.tree.updateFamilySplits(splits);
    targets.tree.updateInsights(_state.lastInsights);
    targets.hover.updateResults(active);
    targets.hover.updateFamilySplits(splits);
    targets.hover.updateInsights(_state.lastInsights);
    targets.codeLens.updateResults(active);
    targets.codeActions.updateResults(active);
    targets.diagnostics.updateFamilySplits(splits);
    targets.diagnostics.updateOverrideAnalyses(_state.lastOverrideAnalyses);
    targets.diagnostics.update(parsed.yamlUri, parsed.yamlContent, active);
    targets.statusBar.update(results, _state.lastInsights);
}
