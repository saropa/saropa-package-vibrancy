import * as vscode from 'vscode';
import { VibrancyResult } from '../types';

export class VibrancyStatusBar implements vscode.Disposable {
    private readonly _item: vscode.StatusBarItem;

    constructor() {
        this._item = vscode.window.createStatusBarItem(
            'saropaPackageVibrancy.status',
            vscode.StatusBarAlignment.Right,
            50,
        );
        this._item.name = 'Package Vibrancy';
        this._item.command = 'saropaPackageVibrancy.showReport';
        this.hide();
    }

    /** Update with scan results. */
    update(results: VibrancyResult[]): void {
        if (results.length === 0) {
            this.hide();
            return;
        }

        const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
        const rounded = Math.round(avg);
        const icon = rounded >= 70 ? '$(pass)' : rounded >= 40 ? '$(info)' : '$(warning)';

        this._item.text = `${icon} Vibrancy: ${rounded}`;
        this._item.tooltip = `${results.length} packages scanned. Click for report.`;
        this._item.show();
    }

    hide(): void {
        this._item.hide();
    }

    dispose(): void {
        this._item.dispose();
    }
}
