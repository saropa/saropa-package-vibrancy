import * as vscode from 'vscode';
import { VibrancyResult, VibrancyCategory } from '../types';
import { categoryIcon, categoryLabel } from '../scoring/status-classifier';

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
        this.description = `${result.score} — ${categoryLabel(result.category)}`;
        this.iconPath = new vscode.ThemeIcon(
            categoryIcon(result.category),
            categoryColor(result.category),
        );
        this.contextValue = 'vibrancyPackage';
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
        new DetailItem('Version', `${result.package.version}`),
        new DetailItem('Score', `${result.score}/100`),
        new DetailItem('Category', categoryLabel(result.category)),
    ];

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

    if (result.knownIssue) {
        items.push(new DetailItem('Known Issue', result.knownIssue.reason));
    }

    return items;
}
