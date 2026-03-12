import * as vscode from 'vscode';
import { ScoringWeights } from '../scoring/vibrancy-calculator';

/**
 * Centralized configuration service.
 * Provides typed access to all extension settings.
 */

const SECTION = 'saropaPackageVibrancy';

function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
}

// --- GitHub & API Settings ---

export function getGithubToken(): string {
    return getConfig().get<string>('githubToken', '');
}

export function getCacheTtlHours(): number {
    return getConfig().get<number>('cacheTtlHours', 24);
}

// --- Scan Settings ---

export function getScanOnOpen(): boolean {
    return getConfig().get<boolean>('scanOnOpen', true);
}

export function getIncludeDevDependencies(): boolean {
    return getConfig().get<boolean>('includeDevDependencies', true);
}

export function getAllowlist(): readonly string[] {
    return getConfig().get<string[]>('allowlist', []);
}

export function getAllowlistSet(): Set<string> {
    return new Set(getAllowlist());
}

export function getRepoOverrides(): Record<string, string> {
    return getConfig().get<Record<string, string>>('repoOverrides', {});
}

// --- Scoring Weights ---

export function getScoringWeights(): ScoringWeights {
    const config = getConfig();
    return {
        resolutionVelocity: config.get<number>('weights.resolutionVelocity', 0.5),
        engagementLevel: config.get<number>('weights.engagementLevel', 0.4),
        popularity: config.get<number>('weights.popularity', 0.1),
    };
}

export function getPublisherTrustBonus(): number {
    return getConfig().get<number>('publisherTrustBonus', 15);
}

// --- UI Settings ---

export function getEnableCodeLens(): boolean {
    return getConfig().get<boolean>('enableCodeLens', true);
}

export function getEnableAdoptionGate(): boolean {
    return getConfig().get<boolean>('enableAdoptionGate', true);
}

export function getCodeLensDetail(): 'minimal' | 'standard' | 'full' {
    return getConfig().get<'minimal' | 'standard' | 'full'>('codeLensDetail', 'standard');
}

export function getTreeGrouping(): 'none' | 'section' | 'category' {
    return getConfig().get<'none' | 'section' | 'category'>('treeGrouping', 'none');
}

// --- Diagnostic Settings ---

export type EndOfLifeDiagnosticMode = 'none' | 'hint' | 'smart';

export function getEndOfLifeDiagnostics(): EndOfLifeDiagnosticMode {
    return getConfig().get<EndOfLifeDiagnosticMode>('endOfLifeDiagnostics', 'none');
}

// --- Suppression Settings ---

export function getSuppressedPackages(): readonly string[] {
    return getConfig().get<string[]>('suppressedPackages', []);
}

export async function addSuppressedPackage(packageName: string): Promise<void> {
    const config = getConfig();
    const current = config.get<string[]>('suppressedPackages', []);
    if (current.includes(packageName)) { return; }
    await config.update(
        'suppressedPackages',
        [...current, packageName],
        vscode.ConfigurationTarget.Workspace,
    );
}

export async function removeSuppressedPackage(packageName: string): Promise<void> {
    const config = getConfig();
    const current = config.get<string[]>('suppressedPackages', []);
    await config.update(
        'suppressedPackages',
        current.filter(n => n !== packageName),
        vscode.ConfigurationTarget.Workspace,
    );
}

// --- Notification Settings ---

export function getShowLockDiffNotifications(): boolean {
    return getConfig().get<boolean>('showLockDiffNotifications', true);
}

// --- Freshness Watch Settings ---

export function getFreshnessWatchEnabled(): boolean {
    return getConfig().get<boolean>('freshnessWatch.enabled', false);
}

export function getFreshnessWatchIntervalHours(): number {
    return getConfig().get<number>('freshnessWatch.intervalHours', 4);
}

export function getFreshnessWatchFilter(): 'all' | 'unhealthy' | 'custom' {
    return getConfig().get<'all' | 'unhealthy' | 'custom'>('freshnessWatch.filter', 'all');
}

export function getFreshnessWatchCustomPackages(): readonly string[] {
    return getConfig().get<string[]>('freshnessWatch.customPackages', []);
}

// --- Annotation Settings ---

export function getAnnotationWithSectionHeaders(): boolean {
    return getConfig().get<boolean>('annotateWithSectionHeaders', false);
}
