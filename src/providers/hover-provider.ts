import * as vscode from 'vscode';
import { VibrancyResult, UpdateInfo } from '../types';
import { categoryLabel } from '../scoring/status-classifier';

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
    md.appendMarkdown(`| Vibrancy Score | **${result.score}**/100 |\n`);
    md.appendMarkdown(
        `| Category | ${categoryLabel(result.category)} |\n`,
    );

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

    if (result.updateInfo
        && result.updateInfo.updateStatus !== 'up-to-date') {
        md.appendMarkdown(`\n---\n`);
        md.appendMarkdown(
            `**Update Available:** ${result.updateInfo.currentVersion} → ${result.updateInfo.latestVersion} (${result.updateInfo.updateStatus})\n\n`,
        );
        appendChangelogSection(md, result.updateInfo);
    }

    if (result.knownIssue) {
        md.appendMarkdown(
            `\n---\n**Known Issue:** ${result.knownIssue.reason}\n`,
        );
    }

    md.appendMarkdown(
        `\n[View on pub.dev](https://pub.dev/packages/${result.package.name})`,
    );

    return md;
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
