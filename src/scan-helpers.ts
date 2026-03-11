import * as vscode from 'vscode';
import { parsePubspecYaml, parsePubspecLock } from './services/pubspec-parser';
import { analyzePackage } from './scan-orchestrator';
import { detectDartVersion, detectFlutterVersion } from './services/sdk-detector';
import { PackageDependency, VibrancyResult } from './types';
import { ScoringWeights } from './scoring/vibrancy-calculator';
import { ReportMetadata } from './services/report-exporter';
import { CacheService } from './services/cache-service';
import { ScanLogger } from './services/scan-logger';
import { FlutterRelease } from './services/flutter-releases';

export interface ScanConfig {
    readonly token: string;
    readonly allowSet: Set<string>;
    readonly weights: ScoringWeights;
    readonly repoOverrides: Record<string, string>;
    readonly publisherTrustBonus: number;
    readonly logger?: ScanLogger;
    readonly flutterReleases?: readonly FlutterRelease[];
}

export function readScanConfig(): ScanConfig {
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
        publisherTrustBonus: config.get<number>('publisherTrustBonus', 15),
    };
}

const CONCURRENCY = 3;

export async function scanPackages(
    deps: PackageDependency[],
    cache: CacheService,
    scanConfig: ScanConfig,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<VibrancyResult[]> {
    const results: VibrancyResult[] = new Array(deps.length);
    let completed = 0;
    let cursor = 0;

    async function next(): Promise<void> {
        while (cursor < deps.length) {
            const idx = cursor++;
            const dep = deps[idx];
            scanConfig.logger?.info(`[${idx + 1}/${deps.length}] ${dep.name}`);
            results[idx] = await analyzePackage(dep, {
                cache, logger: scanConfig.logger,
                githubToken: scanConfig.token || undefined,
                weights: scanConfig.weights,
                repoOverrides: scanConfig.repoOverrides,
                publisherTrustBonus: scanConfig.publisherTrustBonus,
                flutterReleases: scanConfig.flutterReleases,
            });
            completed++;
            progress.report({
                message: `${dep.name} (${completed}/${deps.length})`,
                increment: 100 / deps.length,
            });
        }
    }

    const workers = Array.from(
        { length: Math.min(CONCURRENCY, deps.length) },
        () => next(),
    );
    await Promise.all(workers);
    return results;
}

export async function buildScanMeta(startTime: number): Promise<ReportMetadata> {
    const [flutterVer, dartVer] = await Promise.all([
        detectFlutterVersion(), detectDartVersion(),
    ]);
    return {
        flutterVersion: flutterVer,
        dartVersion: dartVer,
        executionTimeMs: Date.now() - startTime,
    };
}

export interface ParsedDeps {
    readonly deps: PackageDependency[];
    readonly yamlUri: vscode.Uri;
    readonly yamlContent: string;
}

export async function findAndParseDeps(): Promise<ParsedDeps | null> {
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
    const includeDevDeps = config.get<boolean>('includeDevDependencies', true);

    const { directDeps, devDeps, constraints } = parsePubspecYaml(yamlContent);
    const allDirect = includeDevDeps ? [...directDeps, ...devDeps] : directDeps;
    const deps = parsePubspecLock(lockContent, allDirect, constraints)
        .filter(d => d.isDirect && d.source === 'hosted');

    return { deps, yamlUri: yamlFiles[0], yamlContent };
}
