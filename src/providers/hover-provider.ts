import * as vscode from 'vscode';
import { VibrancyResult } from '../types';
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
