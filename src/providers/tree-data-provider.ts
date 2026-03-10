import * as vscode from 'vscode';
import { VibrancyResult } from '../types';
import { PackageItem, DetailItem, buildDetailItems } from './tree-items';

type TreeNode = PackageItem | DetailItem;

export class VibrancyTreeProvider implements vscode.TreeDataProvider<TreeNode> {
    private _results: VibrancyResult[] = [];
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /** Update results and refresh the tree. Sorted worst-first. */
    updateResults(results: VibrancyResult[]): void {
        this._results = [...results].sort((a, b) => a.score - b.score);
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
            return this._results.map(r => new PackageItem(r));
        }
        if (element instanceof PackageItem) {
            return buildDetailItems(element.result);
        }
        return [];
    }
}
