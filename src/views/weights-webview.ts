import * as vscode from 'vscode';
import { VibrancyResult } from '../types';
import { ScoringWeights } from '../scoring/vibrancy-calculator';
import { getScoringWeights } from '../services/config-service';
import { buildWeightsHtml } from './weights-html';

interface ApplyWeightsMessage {
    type: 'applyWeights';
    weights: ScoringWeights;
}

/** Singleton webview panel for adjusting scoring weights with live preview. */
export class WeightsPanel {
    public static currentPanel: WeightsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    static createOrShow(results: readonly VibrancyResult[]): void {
        if (WeightsPanel.currentPanel) {
            WeightsPanel.currentPanel._panel.reveal();
            WeightsPanel.currentPanel._updateContent(results);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'saropaWeightsEditor',
            'Scoring Weights',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true },
        );

        WeightsPanel.currentPanel = new WeightsPanel(panel, results);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        results: readonly VibrancyResult[],
    ) {
        this._panel = panel;
        this._updateContent(results);

        this._panel.onDidDispose(
            () => this._dispose(), null, this._disposables,
        );

        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables,
        );
    }

    private _updateContent(results: readonly VibrancyResult[]): void {
        const weights = getScoringWeights();
        this._panel.webview.html = buildWeightsHtml(results, weights);
    }

    private async _handleMessage(message: ApplyWeightsMessage): Promise<void> {
        if (message.type !== 'applyWeights') { return; }

        const config = vscode.workspace.getConfiguration('saropaPackageVibrancy');
        const { weights } = message;

        // Save each weight to workspace settings
        await config.update(
            'weights.resolutionVelocity', weights.resolutionVelocity,
            vscode.ConfigurationTarget.Workspace,
        );
        await config.update(
            'weights.engagementLevel', weights.engagementLevel,
            vscode.ConfigurationTarget.Workspace,
        );
        await config.update(
            'weights.popularity', weights.popularity,
            vscode.ConfigurationTarget.Workspace,
        );

        vscode.window.showInformationMessage(
            `Scoring weights updated (${weights.resolutionVelocity}/${weights.engagementLevel}/${weights.popularity}). `
            + 'Run a new scan to apply.',
        );
    }

    private _dispose(): void {
        WeightsPanel.currentPanel = undefined;
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
}
