import * as vscode from 'vscode';
import { VibrancyResult, UpdateInfo } from '../types';
import { categoryLabel } from '../scoring/status-classifier';
import { formatSizeMB } from '../scoring/bloat-calculator';
import { classifyLicense, licenseEmoji } from '../scoring/license-classifier';

export class VibrancyHoverProvider implements vscode.HoverProvider {
    private _results = new Map<string, VibrancyResult>();

    /** Update cached results (called after scan). */
    updateResults(results: VibrancyResult[]): void {
        this._results.clear();
        for (const r of results) {
            this._results.set(r.package.name, r);
        }
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | null {
        if (!document.fileName.endsWith('pubspec.yaml')) { return null; }

        const wordRange = document.getWordRangeAtPosition(position, /[\w_]+/);
        if (!wordRange) { return null; }

        const word = document.getText(wordRange);
        const result = this._results.get(word);
        if (!result) { return null; }

        return new vscode.Hover(buildHoverContent(result), wordRange);
    }
}

function buildHoverContent(result: VibrancyResult): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(
        `**${result.package.name}** v${result.package.version}\n\n`,
    );
    md.appendMarkdown(`| | |\n|---|---|\n`);
    const displayScore = Math.round(result.score / 10);
    md.appendMarkdown(`| Vibrancy Score | **${displayScore}**/10 |\n`);
    md.appendMarkdown(
        `| Category | ${categoryLabel(result.category)} |\n`,
    );
    if (result.isUnused) {
        md.appendMarkdown(
            `| Status | **Unused** — no imports detected |\n`,
        );
    }

    if (result.license) {
        const tier = classifyLicense(result.license);
        md.appendMarkdown(
            `| License | ${licenseEmoji(tier)} ${result.license} |\n`,
        );
    }

    if (result.pubDev) {
        const date = result.pubDev.publishedDate.split('T')[0];
        md.appendMarkdown(`| Latest Version | ${result.pubDev.latestVersion} |\n`);
        md.appendMarkdown(`| Published | ${date} |\n`);
        md.appendMarkdown(`| Pub Points | ${result.pubDev.pubPoints} |\n`);
    }

    if (result.github) {
        md.appendMarkdown(`| GitHub Stars | ${result.github.stars} |\n`);
        md.appendMarkdown(`| Open Issues | ${result.github.openIssues} |\n`);
    }

    if (result.bloatRating !== null && result.archiveSizeBytes !== null) {
        const sizeMB = formatSizeMB(result.archiveSizeBytes);
        md.appendMarkdown(
            `| Archive Size | ${sizeMB} (${result.bloatRating}/10 bloat) |\n`,
        );
    }

    if (result.updateInfo
        && result.updateInfo.updateStatus !== 'up-to-date') {
        md.appendMarkdown(`\n---\n`);
        md.appendMarkdown(
            `**Update Available:** ${result.updateInfo.currentVersion} → ${result.updateInfo.latestVersion} (${result.updateInfo.updateStatus})\n\n`,
        );
        appendChangelogSection(md, result.updateInfo);
    }

    appendFlaggedIssues(md, result);

    if (result.knownIssue?.reason) {
        md.appendMarkdown(
            `\n---\n**Known Issue:** ${result.knownIssue.reason}\n`,
        );
    }

    md.appendMarkdown(
        `\n[View on pub.dev](https://pub.dev/packages/${result.package.name})`,
    );

    return md;
}

function appendFlaggedIssues(
    md: vscode.MarkdownString,
    result: VibrancyResult,
): void {
    const flagged = result.github?.flaggedIssues;
    if (!flagged?.length) { return; }
    md.appendMarkdown(`\n---\n`);
    md.appendMarkdown(
        `**Flagged Issues** (${flagged.length}):\n\n`,
    );
    for (const issue of flagged.slice(0, 3)) {
        const title = truncateBody(issue.title);
        const signals = issue.matchedSignals.join(', ');
        md.appendMarkdown(
            `- [#${issue.number}](${issue.url}) ${title} *(${signals})*\n`,
        );
    }
    if (flagged.length > 3) {
        md.appendMarkdown(
            `- *...and ${flagged.length - 3} more*\n`,
        );
    }
}

function appendChangelogSection(
    md: vscode.MarkdownString,
    updateInfo: UpdateInfo,
): void {
    if (updateInfo.changelog?.entries.length) {
        md.appendMarkdown(`**Changelog:**\n\n`);
        const entriesToShow = updateInfo.changelog.entries.slice(0, 5);
        for (const entry of entriesToShow) {
            const dateStr = entry.date ? ` - ${entry.date}` : '';
            md.appendMarkdown(`**v${entry.version}**${dateStr}\n\n`);
            const body = truncateBody(entry.body);
            if (body) {
                md.appendMarkdown(`${body}\n\n`);
            }
        }
        if (updateInfo.changelog.entries.length > 5) {
            md.appendMarkdown(
                `*...and ${updateInfo.changelog.entries.length - 5} more version(s)*\n\n`,
            );
        }
    } else if (updateInfo.changelog?.unavailableReason) {
        md.appendMarkdown(
            `*Changelog: ${updateInfo.changelog.unavailableReason}*\n\n`,
        );
    }
}

function truncateBody(body: string): string {
    if (!body) { return ''; }
    return body.length > 200 ? body.substring(0, 197) + '...' : body;
}
