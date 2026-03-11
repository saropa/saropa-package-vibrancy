import * as vscode from 'vscode';
import { VibrancyResult, VibrancyCategory, UpdateInfo } from '../types';
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

function updateEmoji(status: string): string {
    switch (status) {
        case 'patch': return '🟢';
        case 'minor': return '🟡';
        case 'major': return '🔴';
        default: return '🟡';
    }
}

function bloatEmoji(rating: number): string {
    if (rating <= 3) { return '🟢'; }
    if (rating <= 6) { return '🟡'; }
    return '🔴';
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

export class GroupItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly children: DetailItem[],
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
    }
}

/** Build grouped child items for a package node. */
export function buildGroupItems(result: VibrancyResult): GroupItem[] {
    const groups: GroupItem[] = [];
    groups.push(buildVersionGroup(result));

    const update = buildUpdateGroup(result);
    if (update) { groups.push(update); }

    const community = buildCommunityGroup(result);
    if (community) { groups.push(community); }

    const size = buildSizeGroup(result);
    if (size) { groups.push(size); }

    const alerts = buildAlertsGroup(result);
    if (alerts) { groups.push(alerts); }

    return groups;
}

function buildVersionGroup(result: VibrancyResult): GroupItem {
    const items: DetailItem[] = [
        new DetailItem('Version', result.package.constraint),
    ];
    if (result.pubDev) {
        items.push(new DetailItem('Latest', result.pubDev.latestVersion));
        if (result.pubDev.publishedDate) {
            items.push(new DetailItem(
                'Published', result.pubDev.publishedDate.split('T')[0],
            ));
        }
    }
    return new GroupItem('📦 Version', items);
}

function buildUpdateGroup(result: VibrancyResult): GroupItem | null {
    if (!result.updateInfo
        || result.updateInfo.updateStatus === 'up-to-date') {
        return null;
    }
    const ui = result.updateInfo;
    const emoji = updateEmoji(ui.updateStatus);
    const items: DetailItem[] = [
        new DetailItem(
            `${emoji} ${ui.currentVersion} → ${ui.latestVersion}`,
            `(${ui.updateStatus})`,
        ),
    ];
    appendChangelogItems(items, ui);
    return new GroupItem('⬆️ Update', items);
}

function appendChangelogItems(
    items: DetailItem[],
    ui: UpdateInfo,
): void {
    if (ui.changelog?.entries.length) {
        for (const entry of ui.changelog.entries) {
            const dateStr = entry.date ? ` (${entry.date})` : '';
            const firstLine = entry.body.split('\n').find(
                l => l.trim(),
            ) ?? '';
            const preview = firstLine.length > 60
                ? firstLine.substring(0, 57) + '...'
                : firstLine;
            items.push(new DetailItem(
                `v${entry.version}${dateStr}`, preview,
            ));
        }
        if (ui.changelog.truncated) {
            items.push(new DetailItem(
                '...', 'More entries available on GitHub',
            ));
        }
    } else if (ui.changelog?.unavailableReason) {
        items.push(new DetailItem(
            'Changelog', ui.changelog.unavailableReason,
        ));
    }
}

function buildCommunityGroup(result: VibrancyResult): GroupItem | null {
    if (!result.github) { return null; }
    return new GroupItem('📊 Community', [
        new DetailItem('⭐ Stars', `${result.github.stars}`),
        new DetailItem('Open Issues', `${result.github.openIssues}`),
    ]);
}

function buildSizeGroup(result: VibrancyResult): GroupItem | null {
    if (result.bloatRating === null || result.archiveSizeBytes === null) {
        return null;
    }
    const emoji = bloatEmoji(result.bloatRating);
    const sizeMB = formatSizeMB(result.archiveSizeBytes);
    return new GroupItem('📏 Size', [
        new DetailItem(
            `${emoji} Archive Size`,
            `${sizeMB} (${result.bloatRating}/10 bloat)`,
        ),
    ]);
}

function buildAlertsGroup(result: VibrancyResult): GroupItem | null {
    const items: DetailItem[] = [];
    appendFlaggedItems(items, result);
    if (result.knownIssue?.reason) {
        items.push(new DetailItem('❌ Known Issue', result.knownIssue.reason));
    }
    if (items.length === 0) { return null; }
    return new GroupItem('🚨 Alerts', items);
}

function appendFlaggedItems(
    items: DetailItem[],
    result: VibrancyResult,
): void {
    const flagged = result.github?.flaggedIssues;
    if (!flagged?.length) { return; }
    items.push(new DetailItem(
        '🚩 Flagged Issues', `${flagged.length} high-signal`,
    ));
    for (const issue of flagged.slice(0, 3)) {
        const title = issue.title.length > 50
            ? issue.title.substring(0, 47) + '...' : issue.title;
        items.push(new DetailItem(
            `  #${issue.number}`, `${title} (${issue.matchedSignals[0]})`,
        ));
    }
}
