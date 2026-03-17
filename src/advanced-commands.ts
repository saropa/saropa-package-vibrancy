/** Advanced command handlers: upgrades, comparison, sorting, prereleases. */
import * as vscode from 'vscode';
import { _state } from './activation-state';
import type { ScanTargets } from './extension-activation';
import { VibrancyResult, ComparisonData } from './types';
import { buildUpgradeOrder, setOverrideAnalyses } from './scoring/upgrade-sequencer';
import { executeUpgradePlan, formatUpgradePlan, formatUpgradeReport } from './services/upgrade-executor';
import { findPubspecYaml } from './services/pubspec-editor';
import { bulkUpdate } from './services/bulk-updater';
import { IncrementFilter } from './scoring/version-increment';
import { ComparisonPanel } from './views/comparison-webview';
import { resultToComparisonData } from './scoring/comparison-ranker';
import { fetchPackageInfo, fetchPackageMetrics, fetchPublisher, fetchArchiveSize } from './services/pub-dev-api';
import { extractGitHubRepo, fetchRepoMetrics } from './services/github-api';
import { calcBloatRating } from './scoring/bloat-calculator';
import { sortDependencies } from './services/pubspec-sorter';
import type { CacheService } from './services/cache-service';
import { runScan } from './scan-runner';

/** Plan and execute a sequenced upgrade of all outdated packages. */
export async function planAndExecuteUpgrades(): Promise<void> {
    if (_state.latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }

    if (!_state.upgradeChannel) {
        _state.upgradeChannel = vscode.window.createOutputChannel(
            'Saropa: Upgrade Plan',
        );
    }
    _state.upgradeChannel.clear();

    setOverrideAnalyses(_state.lastOverrideAnalyses);
    const reverseDeps = _state.lastReverseDeps ?? new Map();
    const steps = buildUpgradeOrder(_state.latestResults, reverseDeps);
    if (steps.length === 0) {
        vscode.window.showInformationMessage('No upgradable packages found');
        return;
    }

    _state.upgradeChannel.appendLine(formatUpgradePlan(steps));
    _state.upgradeChannel.show(true);

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
        () => executeUpgradePlan(steps, _state.upgradeChannel!, {
            skipTests: config.get<boolean>('upgradeSkipTests', false),
            maxSteps: config.get<number>('upgradeMaxSteps', 20),
            autoCommit: config.get<boolean>('upgradeAutoCommit', false),
        }),
    );

    _state.upgradeChannel.appendLine('\n' + formatUpgradeReport(report));
    _state.upgradeChannel.show(true);

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

/** Update a single package to a prerelease version with confirmation. */
export async function updateToPrerelease(
    packageName: string,
    version: string,
): Promise<void> {
    const pubspecUri = await findPubspecYaml();
    if (!pubspecUri) {
        vscode.window.showWarningMessage('No pubspec.yaml found');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Update ${packageName} to prerelease ${version}? Prereleases may contain breaking changes.`,
        { modal: true },
        'Update',
    );
    if (confirm !== 'Update') { return; }

    const doc = await vscode.workspace.openTextDocument(pubspecUri);
    const edit = new vscode.WorkspaceEdit();
    const text = doc.getText();
    const lines = text.split('\n');

    let found = false;
    const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(new RegExp(`^(\\s*${escapedName}:\\s*)(\\S+.*?)$`));
        if (match) {
            const start = new vscode.Position(i, match[1].length);
            const end = new vscode.Position(i, line.length);
            edit.replace(doc.uri, new vscode.Range(start, end), `^${version}`);
            found = true;
            break;
        }
    }

    if (!found) {
        vscode.window.showWarningMessage(`Package ${packageName} not found in pubspec.yaml`);
        return;
    }

    await vscode.workspace.applyEdit(edit);
    await doc.save();
    vscode.window.showInformationMessage(`Updated ${packageName} to ${version}`);
}

/** Run bulk update filtered by version increment type, then re-scan. */
export async function runBulkUpdate(
    filter: IncrementFilter,
    targets: ScanTargets,
): Promise<void> {
    if (_state.latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }

    const result = await bulkUpdate(_state.latestResults, {
        incrementFilter: filter,
    });

    if (result.updated.length > 0 && !result.cancelled) {
        await runScan(targets);
    }
}

/** Sort dependencies alphabetically in pubspec.yaml. */
export async function runSortDependencies(): Promise<void> {
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

/** Compare 2-3 packages in a side-by-side webview panel. */
export async function runComparePackages(cache: CacheService): Promise<void> {
    const packageNames = await promptForPackageNames();
    if (!packageNames || packageNames.length < 2) {
        vscode.window.showWarningMessage('Select 2-3 packages to compare');
        return;
    }

    if (packageNames.length > 3) {
        vscode.window.showWarningMessage('Maximum 3 packages for comparison');
        return;
    }

    const comparisonData = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Fetching package data...',
            cancellable: false,
        },
        async () => {
            const resolvedNames = new Set(_state.latestResults.map(r => r.package.name));
            const data: ComparisonData[] = [];

            for (const name of packageNames) {
                const existing = _state.latestResults.find(r => r.package.name === name);
                if (existing) {
                    data.push(resultToComparisonData(existing, true));
                } else {
                    const fetched = await fetchComparisonData(name, cache);
                    if (fetched) {
                        data.push({ ...fetched, inProject: resolvedNames.has(name) });
                    }
                }
            }

            return data;
        },
    );

    if (comparisonData.length < 2) {
        vscode.window.showWarningMessage('Could not fetch enough package data');
        return;
    }

    ComparisonPanel.createOrShow(comparisonData);
}

/** Prompt user to pick packages from scan results or type names manually. */
async function promptForPackageNames(): Promise<string[] | undefined> {
    const scannedItems = _state.latestResults.map(r => ({
        label: r.package.name,
        description: `${r.score}/100 — ${r.category}`,
        picked: false,
    }));

    if (scannedItems.length > 0) {
        const selection = await vscode.window.showQuickPick(scannedItems, {
            title: 'Select packages to compare',
            placeHolder: 'Choose 2-3 packages (or type to search pub.dev)',
            canPickMany: true,
        });

        if (selection && selection.length >= 2) {
            return selection.map(s => s.label);
        }
    }

    const input = await vscode.window.showInputBox({
        title: 'Compare Packages',
        prompt: 'Enter 2-3 package names separated by commas',
        placeHolder: 'e.g., http, dio, chopper',
    });

    if (!input) { return undefined; }

    return input.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/** Fetch comparison data for a package not already in scan results. */
async function fetchComparisonData(
    name: string,
    cache: CacheService,
): Promise<ComparisonData | null> {
    const [info, metrics, publisher, archiveSize] = await Promise.all([
        fetchPackageInfo(name, cache),
        fetchPackageMetrics(name, cache),
        fetchPublisher(name, cache),
        fetchArchiveSize(name, cache),
    ]);

    if (!info) { return null; }

    let stars: number | null = null;
    let openIssues: number | null = null;

    if (info.repositoryUrl?.includes('github.com')) {
        const extracted = extractGitHubRepo(info.repositoryUrl);
        if (extracted) {
            const ghMetrics = await fetchRepoMetrics(
                extracted.owner,
                extracted.repo,
                { cache },
            );
            if (ghMetrics) {
                stars = ghMetrics.stars;
                openIssues = ghMetrics.openIssues;
            }
        }
    }

    const bloatRating = archiveSize !== null ? calcBloatRating(archiveSize) : null;

    return {
        name,
        vibrancyScore: null,
        category: null,
        latestVersion: info.latestVersion,
        publishedDate: info.publishedDate?.split('T')[0] ?? null,
        publisher,
        pubPoints: metrics.pubPoints,
        likes: metrics.likes,
        downloads: metrics.downloads,
        stars,
        openIssues,
        archiveSizeBytes: archiveSize,
        bloatRating,
        license: info.license,
        platforms: metrics.platforms,
        inProject: false,
    };
}
