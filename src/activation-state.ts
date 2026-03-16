/**
 * Shared mutable state for the extension activation lifecycle.
 * Extracted to avoid circular dependencies between scan-runner,
 * command-handlers, and the main activation module.
 */
import type * as vscode from 'vscode';
import type {
    VibrancyResult, OverrideAnalysis, PackageInsight,
    BudgetResult, DepEdge,
} from './types';
import type { ParsedDeps } from './scan-helpers';
import type { ReportMetadata } from './services/report-exporter';
import type { FreshnessWatcher } from './services/freshness-watcher';
import type { VibrancyStateManager } from './state';
import type { DetailViewProvider } from './views/detail-view-provider';
import type { DetailLogger } from './services/detail-logger';
import type { SaveTaskRunner } from './services/save-task-runner';
import type { RegistryService } from './services/registry-service';
import { ProblemRegistry } from './problems';
import type { ProblemTreeProvider } from './providers/problem-tree-provider';

/** Shared mutable state bag — properties are mutated by scan-runner and command handlers. */
export const _state = {
    latestResults: [] as VibrancyResult[],
    lastParsedDeps: null as ParsedDeps | null,
    lastReverseDeps: null as ReadonlyMap<string, readonly DepEdge[]> | null,
    lastOverrideAnalyses: [] as OverrideAnalysis[],
    lastInsights: [] as PackageInsight[],
    lastBudgetResults: [] as BudgetResult[],
    lastScanMeta: {
        flutterVersion: 'unknown',
        dartVersion: 'unknown',
        executionTimeMs: 0,
    } as ReportMetadata,
    freshnessWatcher: null as FreshnessWatcher | null,
    stateManager: null as VibrancyStateManager | null,
    detailViewProvider: null as DetailViewProvider | null,
    detailLogger: null as DetailLogger | null,
    detailChannel: null as vscode.OutputChannel | null,
    saveTaskRunner: null as SaveTaskRunner | null,
    registryService: null as RegistryService | null,
    problemRegistry: new ProblemRegistry(),
    problemTreeProvider: null as ProblemTreeProvider | null,
    upgradeChannel: null as vscode.OutputChannel | null,
};

/** Get the latest scan results (used by providers). */
export function getLatestResults(): readonly VibrancyResult[] {
    return _state.latestResults;
}

/** Get the latest consolidated insights (used by providers). */
export function getLatestInsights(): readonly PackageInsight[] {
    return _state.lastInsights;
}

/** Get the vibrancy state manager (used by providers). */
export function getStateManager(): VibrancyStateManager | null {
    return _state.stateManager;
}

/** Get the registry service (used by providers). */
export function getRegistryService(): RegistryService | null {
    return _state.registryService;
}

/** Get the problem registry (used by providers). */
export function getProblemRegistry(): ProblemRegistry {
    return _state.problemRegistry;
}

/** Stop the freshness watcher (called on deactivation). */
export function stopFreshnessWatcher(): void {
    _state.freshnessWatcher?.stop();
}
