import * as vscode from 'vscode';
import { VibrancyResult, FamilySplit } from '../types';
import {
    PackageItem, DetailItem, GroupItem, SuppressedGroupItem,
    SuppressedPackageItem, buildGroupItems,
} from './tree-items';
import {
    FamilyConflictGroupItem, FamilySplitItem, buildFamilySplitDetails,
} from './family-tree-items';

type TreeNode =
    | PackageItem | GroupItem | DetailItem
    | SuppressedGroupItem | FamilyConflictGroupItem | FamilySplitItem;

export class VibrancyTreeProvider implements vscode.TreeDataProvider<TreeNode> {
    private _results: VibrancyResult[] = [];
    private _familySplits: FamilySplit[] = [];
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /** Update results and refresh the tree. Sorted worst-first. */
    updateResults(results: VibrancyResult[]): void {
        this._results = [...results].sort((a, b) => a.score - b.score);
        this._onDidChangeTreeData.fire();
    }

    /** Update detected family version splits. */
    updateFamilySplits(splits: FamilySplit[]): void {
        this._familySplits = splits;
        this._onDidChangeTreeData.fire();
    }

    /** Re-fire the change event to refresh the tree display. */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getResults(): readonly VibrancyResult[] {
        return this._results;
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): TreeNode[] {
        if (!element) {
            return this._buildRootChildren();
        }
        if (element instanceof FamilyConflictGroupItem) {
            return element.splits.map(s => new FamilySplitItem(s));
        }
        if (element instanceof FamilySplitItem) {
            return buildFamilySplitDetails(element.split);
        }
        if (element instanceof SuppressedGroupItem) {
            return this._getSuppressedResults().map(
                r => new SuppressedPackageItem(r),
            );
        }
        if (element instanceof PackageItem) {
            return buildGroupItems(element.result);
        }
        if (element instanceof GroupItem) {
            return element.children;
        }
        return [];
    }

    private _buildRootChildren(): TreeNode[] {
        const items: TreeNode[] = [];
        if (this._familySplits.length > 0) {
            items.push(
                new FamilyConflictGroupItem(this._familySplits),
            );
        }
        const suppressed = this._getSuppressedSet();
        const active = this._results.filter(
            r => !suppressed.has(r.package.name),
        );
        for (const r of active) {
            items.push(new PackageItem(r));
        }
        const suppressedCount = this._results.length - active.length;
        if (suppressedCount > 0) {
            items.push(new SuppressedGroupItem(suppressedCount));
        }
        return items;
    }

    private _getSuppressedSet(): Set<string> {
        const config = vscode.workspace.getConfiguration(
            'saropaPackageVibrancy',
        );
        return new Set(config.get<string[]>('suppressedPackages', []));
    }

    private _getSuppressedResults(): VibrancyResult[] {
        const suppressed = this._getSuppressedSet();
        return this._results.filter(
            r => suppressed.has(r.package.name),
        );
    }
}
