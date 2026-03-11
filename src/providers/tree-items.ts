import * as vscode from 'vscode';
import { VibrancyResult, VibrancyCategory } from '../types';
import { categoryIcon, categoryLabel } from '../scoring/status-classifier';
import { formatSizeMB } from '../scoring/bloat-calculator';

function categoryColor(cat: VibrancyCategory): vscode.ThemeColor {
    switch (cat) {
        case 'vibrant': return new vscode.ThemeColor('testing.iconPassed');
        case 'quiet': return new vscode.ThemeColor('editorInfo.foreground');
        case 'legacy-locked': return new vscode.ThemeColor('editorWarning.foreground');
        case 'end-of-life': return new vscode.ThemeColor('editorError.foreground');
    }
}

export class PackageItem extends vscode.TreeItem {
    constructor(public readonly result: VibrancyResult) {
        super(result.package.name, vscode.TreeItemCollapsibleState.Collapsed);
        const hasUpdate = result.updateInfo?.updateStatus
            && result.updateInfo.updateStatus !== 'up-to-date';
        const displayScore = Math.round(result.score / 10);
        let desc = `${displayScore}/10 — ${categoryLabel(result.category)}`;
        if (hasUpdate) {
            desc += ` → ${result.updateInfo!.latestVersion}`;
        }
        this.description = desc;
        this.iconPath = new vscode.ThemeIcon(
            categoryIcon(result.category),
            categoryColor(result.category),
        );
        this.contextValue = hasUpdate
            ? 'vibrancyPackageUpdatable' : 'vibrancyPackage';
        this.command = {
            command: 'saropaPackageVibrancy.goToPackage',
            title: 'Go to pubspec.yaml',
            arguments: [result.package.name],
        };
    }
}

export class SuppressedGroupItem extends vscode.TreeItem {
    constructor(count: number) {
        super(`Suppressed (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon(
            'eye-closed',
            new vscode.ThemeColor('disabledForeground'),
        );
        this.contextValue = 'vibrancySuppressedGroup';
    }
}

export class SuppressedPackageItem extends PackageItem {
    constructor(result: VibrancyResult) {
        super(result);
        this.iconPath = new vscode.ThemeIcon(
            'eye-closed',
            new vscode.ThemeColor('disabledForeground'),
        );
        const hasUpdate = result.updateInfo?.updateStatus
            && result.updateInfo.updateStatus !== 'up-to-date';
        this.contextValue = hasUpdate
            ? 'vibrancyPackageSuppressedUpdatable'
            : 'vibrancyPackageSuppressed';
    }
}

export class DetailItem extends vscode.TreeItem {
    constructor(label: string, detail: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = detail;
    }
}

/** Build child detail items for a package node. */
export function buildDetailItems(result: VibrancyResult): DetailItem[] {
    const items: DetailItem[] = [
        new DetailItem('Version', `${result.package.constraint}`),
        new DetailItem('Score', `${Math.round(result.score / 10)}/10`),
        new DetailItem('Category', categoryLabel(result.category)),
    ];

    if (result.updateInfo
        && result.updateInfo.updateStatus !== 'up-to-date') {
        const arrow = `${result.updateInfo.currentVersion} → ${result.updateInfo.latestVersion} (${result.updateInfo.updateStatus})`;
        items.push(new DetailItem('Update Available', arrow));

        if (result.updateInfo.changelog?.entries.length) {
            for (const entry of result.updateInfo.changelog.entries) {
                const dateStr = entry.date ? ` (${entry.date})` : '';
                const firstLine = entry.body.split('\n').find(
                    l => l.trim(),
                ) ?? '';
                const preview = firstLine.length > 60
                    ? firstLine.substring(0, 57) + '...'
                    : firstLine;
                items.push(new DetailItem(
                    `  v${entry.version}${dateStr}`, preview,
                ));
            }
            if (result.updateInfo.changelog.truncated) {
                items.push(new DetailItem(
                    '  ...', 'More entries available on GitHub',
                ));
            }
        } else if (result.updateInfo.changelog?.unavailableReason) {
            items.push(new DetailItem(
                '  Changelog', result.updateInfo.changelog.unavailableReason,
            ));
        }
    }

    if (result.pubDev) {
        items.push(new DetailItem('Latest', result.pubDev.latestVersion));
        if (result.pubDev.publishedDate) {
            items.push(new DetailItem(
                'Published',
                result.pubDev.publishedDate.split('T')[0],
            ));
        }
    }

    if (result.github) {
        items.push(new DetailItem('Stars', `${result.github.stars}`));
        items.push(new DetailItem('Open Issues', `${result.github.openIssues}`));
    }

    if (result.bloatRating !== null && result.archiveSizeBytes !== null) {
        const sizeMB = formatSizeMB(result.archiveSizeBytes);
        items.push(new DetailItem(
            'Archive Size', `${sizeMB} (${result.bloatRating}/10 bloat)`,
        ));
    }

    appendFlaggedItems(items, result);

    if (result.knownIssue?.reason) {
        items.push(new DetailItem('Known Issue', result.knownIssue.reason));
    }

    return items;
}

function appendFlaggedItems(
    items: DetailItem[],
    result: VibrancyResult,
): void {
    const flagged = result.github?.flaggedIssues;
    if (!flagged?.length) { return; }
    items.push(new DetailItem(
        'Flagged Issues', `${flagged.length} high-signal`,
    ));
    for (const issue of flagged.slice(0, 3)) {
        const title = issue.title.length > 50
            ? issue.title.substring(0, 47) + '...' : issue.title;
        items.push(new DetailItem(
            `  #${issue.number}`, `${title} (${issue.matchedSignals[0]})`,
        ));
    }
}
