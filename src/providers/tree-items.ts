import * as vscode from 'vscode';
import { VibrancyResult, VibrancyCategory, UpdateInfo } from '../types';
import { categoryIcon, categoryLabel } from '../scoring/status-classifier';
import { formatSizeMB } from '../scoring/bloat-calculator';
import { classifyLicense, licenseEmoji } from '../scoring/license-classifier';

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
        const base = result.isUnused
            ? 'vibrancyPackageUnused' : 'vibrancyPackage';
        this.contextValue = hasUpdate ? base + 'Updatable' : base;
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
    readonly url?: string;

    constructor(label: string, detail: string, url?: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = detail;
        if (url) {
            this.url = url;
            this.command = {
                command: 'saropaPackageVibrancy.openUrl',
                title: 'Open Link',
                arguments: [url],
            };
            this.tooltip = url;
            this.contextValue = 'vibrancyDetailLink';
        }
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
        const name = result.package.name;
        const ver = result.pubDev.latestVersion;
        const versionUrl = `https://pub.dev/packages/${name}/versions/${ver}`;
        items.push(new DetailItem('Latest', ver, versionUrl));
        if (result.pubDev.publishedDate) {
            items.push(new DetailItem(
                'Published', result.pubDev.publishedDate.split('T')[0],
                versionUrl,
            ));
        }
    }
    if (result.license) {
        const tier = classifyLicense(result.license);
        const emoji = licenseEmoji(tier);
        items.push(new DetailItem(
            `${emoji} License`, result.license,
        ));
    }
    if (result.platforms?.length) {
        items.push(new DetailItem(
            '🖥️ Platforms', result.platforms.join(', '),
        ));
    }
    if (result.wasmReady !== null && result.wasmReady !== undefined) {
        items.push(new DetailItem(
            '🌐 WASM', result.wasmReady ? 'Ready' : 'Not ready',
        ));
    }
    if (result.drift) {
        const d = result.drift;
        const behind = d.releasesBehind === 0
            ? 'Current' : `${d.releasesBehind} Flutter releases behind`;
        items.push(new DetailItem(
            '🕐 Drift', `${behind} (${d.label})`,
        ));
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
    if (result.blocker) {
        const b = result.blocker;
        items.push(new DetailItem(
            '🔒 Blocked by', b.blockerPackage,
        ));
        if (b.blockerVibrancyScore !== null) {
            const score = Math.round(b.blockerVibrancyScore / 10);
            const cat = b.blockerCategory ?? 'unknown';
            items.push(new DetailItem(
                '  vibrancy', `${score}/10 (${cat})`,
            ));
        }
    }
    appendChangelogItems(items, ui, result.package.name);
    return new GroupItem('⬆️ Update', items);
}

function appendChangelogItems(
    items: DetailItem[], ui: UpdateInfo, packageName: string,
): void {
    const cl = ui.changelog;
    if (cl?.entries.length) {
        const baseUrl = `https://pub.dev/packages/${packageName}/changelog`;
        for (const entry of cl.entries) {
            const dateStr = entry.date ? ` (${entry.date})` : '';
            const firstLine = entry.body.split('\n').find(l => l.trim()) ?? '';
            const preview = firstLine.length > 60
                ? firstLine.substring(0, 57) + '...' : firstLine;
            const anchor = entry.version.replace(/\./g, '');
            items.push(new DetailItem(
                `v${entry.version}${dateStr}`, preview, `${baseUrl}#${anchor}`,
            ));
        }
        if (cl.truncated) {
            items.push(new DetailItem('...', 'More entries on pub.dev', baseUrl));
        }
    } else if (cl?.unavailableReason) {
        items.push(new DetailItem('Changelog', cl.unavailableReason));
    }
}

function buildCommunityGroup(result: VibrancyResult): GroupItem | null {
    const items: DetailItem[] = [];
    if (result.github) {
        const repoUrl = result.pubDev?.repositoryUrl?.replace(/\/+$/, '');
        items.push(new DetailItem(
            '⭐ Stars', `${result.github.stars}`,
            repoUrl ?? undefined,
        ));
        items.push(new DetailItem(
            'Open Issues', `${result.github.openIssues}`,
            repoUrl ? `${repoUrl}/issues` : undefined,
        ));
    }
    if (result.pubDev?.pubPoints !== undefined) {
        items.push(new DetailItem(
            '📊 Pub Points', `${result.pubDev.pubPoints}/160`,
        ));
    }
    if (result.verifiedPublisher) {
        items.push(new DetailItem('✅ Publisher', 'Verified'));
    }
    if (items.length === 0) { return null; }
    return new GroupItem('📊 Community', items);
}

function buildSizeGroup(result: VibrancyResult): GroupItem | null {
    if (result.bloatRating === null || result.archiveSizeBytes === null) { return null; }
    const emoji = bloatEmoji(result.bloatRating);
    const sizeMB = formatSizeMB(result.archiveSizeBytes);
    return new GroupItem('📏 Size', [
        new DetailItem(`${emoji} Archive Size`, `${sizeMB} (${result.bloatRating}/10 bloat)`),
    ]);
}

function buildAlertsGroup(result: VibrancyResult): GroupItem | null {
    const items: DetailItem[] = [];
    if (result.isUnused) {
        items.push(new DetailItem(
            '⚠️ Unused', 'No imports found in lib/, bin/, or test/',
        ));
    }
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
            issue.url || undefined,
        ));
    }
}

