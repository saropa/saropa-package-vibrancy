import * as vscode from 'vscode';
import { runActivation, stopFreshnessWatcher } from './extension-activation';

export function activate(context: vscode.ExtensionContext): void {
    const outputChannel = vscode.window.createOutputChannel('Saropa Package Vibrancy');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('Saropa Package Vibrancy activated');
    runActivation(context);
}

export function deactivate(): void {
    stopFreshnessWatcher();
}
