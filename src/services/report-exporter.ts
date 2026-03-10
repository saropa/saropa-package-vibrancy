import * as vscode from 'vscode';
import { VibrancyResult } from '../types';
import { categoryLabel } from '../scoring/status-classifier';

/**
 * Export scan results as timestamped markdown and JSON files
 * to a report/ directory in the workspace.
 */
export async function exportReports(
    results: VibrancyResult[],
    metadata: ReportMetadata,
): Promise<string[]> {
    const folder = await resolveReportFolder();
    if (!folder) { return []; }

    const timestamp = formatTimestamp(new Date());
    const written: string[] = [];

    const mdUri = vscode.Uri.joinPath(
        folder, `${timestamp}_saropa_vibrancy.md`,
    );
    const mdContent = buildMarkdownReport(results, metadata);
    await vscode.workspace.fs.writeFile(
        mdUri, Buffer.from(mdContent, 'utf-8'),
    );
    written.push(mdUri.fsPath);

    const jsonUri = vscode.Uri.joinPath(
        folder, `${timestamp}_saropa_vibrancy.json`,
    );
    const jsonContent = buildJsonReport(results, metadata);
    await vscode.workspace.fs.writeFile(
        jsonUri, Buffer.from(jsonContent, 'utf-8'),
    );
    written.push(jsonUri.fsPath);

    return written;
}

export interface ReportMetadata {
    readonly flutterVersion: string;
    readonly dartVersion: string;
    readonly executionTimeMs: number;
}

async function resolveReportFolder(): Promise<vscode.Uri | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }

    const reportDir = vscode.Uri.joinPath(folders[0].uri, 'report');
    await vscode.workspace.fs.createDirectory(reportDir);
    return reportDir;
}

function formatTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
        date.getFullYear(),
        '-', pad(date.getMonth() + 1),
        '-', pad(date.getDate()),
        '_', pad(date.getHours()),
        '-', pad(date.getMinutes()),
        '-', pad(date.getSeconds()),
    ].join('');
}

function countByCategory(results: VibrancyResult[]) {
    let vibrant = 0, quiet = 0, legacy = 0, eol = 0;
    for (const r of results) {
        switch (r.category) {
            case 'vibrant': vibrant++; break;
            case 'quiet': quiet++; break;
            case 'legacy-locked': legacy++; break;
            case 'end-of-life': eol++; break;
        }
    }
    return { vibrant, quiet, legacy, eol };
}

function buildMarkdownReport(
    results: VibrancyResult[],
    meta: ReportMetadata,
): string {
    const counts = countByCategory(results);
    const lines: string[] = [
        '# Saropa Package Vibrancy Report',
        '',
        `| | |`,
        `|---|---|`,
        `| Timestamp | ${new Date().toISOString()} |`,
        `| Flutter | ${meta.flutterVersion} |`,
        `| Dart | ${meta.dartVersion} |`,
        `| Execution | ${meta.executionTimeMs}ms |`,
        '',
        '## Summary',
        '',
        `| Total | Vibrant | Quiet | Legacy-Locked | End of Life |`,
        `|-------|---------|-------|---------------|-------------|`,
        `| ${results.length} | ${counts.vibrant} | ${counts.quiet} | ${counts.legacy} | ${counts.eol} |`,
        '',
        '## Packages',
        '',
        '| Name | Version | Latest | Status | Score |',
        '|------|---------|--------|--------|-------|',
    ];

    for (const r of results) {
        const latest = r.pubDev?.latestVersion ?? '';
        const label = categoryLabel(r.category);
        lines.push(
            `| ${r.package.name} | ${r.package.version} | ${latest} | ${label} | ${r.score} |`,
        );
    }

    return lines.join('\n') + '\n';
}

function buildJsonReport(
    results: VibrancyResult[],
    meta: ReportMetadata,
): string {
    const counts = countByCategory(results);

    const report = {
        audit_metadata: {
            timestamp: new Date().toISOString(),
            flutter_version: meta.flutterVersion,
            dart_version: meta.dartVersion,
            total_packages_scanned: results.length,
            execution_time_ms: meta.executionTimeMs,
        },
        summary: {
            total: results.length,
            vibrant: counts.vibrant,
            quiet: counts.quiet,
            legacy_locked: counts.legacy,
            end_of_life: counts.eol,
        },
        packages: results.map(r => ({
            name: r.package.name,
            installed_version: r.package.version,
            latest_version: r.pubDev?.latestVersion ?? '',
            status: categoryLabel(r.category),
            vibrancy_score: r.score,
            pub_points: r.pubDev?.pubPoints ?? 0,
            stars: r.github?.stars ?? 0,
            is_discontinued: r.pubDev?.isDiscontinued ?? false,
            is_unlisted: r.pubDev?.isUnlisted ?? false,
            pub_dev_url: `https://pub.dev/packages/${r.package.name}`,
            repository_url: r.pubDev?.repositoryUrl ?? '',
        })),
    };

    return JSON.stringify(report, null, 2) + '\n';
}
