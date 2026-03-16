/** CI config generation command handlers. */
import * as vscode from 'vscode';
import { _state } from './activation-state';
import { CiPlatform, CiThresholds } from './types';
import { suggestThresholds, formatThresholdsSummary } from './services/threshold-suggester';
import {
    generateCiWorkflow, getDefaultOutputPath, getAvailablePlatforms,
} from './services/ci-generator';

/** Interactive CI pipeline generation — selects platform, configures thresholds, writes file. */
export async function generateCiConfig(): Promise<void> {
    if (_state.latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first to generate CI config with appropriate thresholds');
        return;
    }

    const platforms = getAvailablePlatforms();
    const platformSelection = await vscode.window.showQuickPick(
        platforms.map(p => ({
            label: p.label,
            description: p.description,
            id: p.id,
        })),
        {
            title: 'Generate CI Pipeline',
            placeHolder: 'Select CI platform',
        },
    );
    if (!platformSelection) { return; }

    const platform = platformSelection.id as CiPlatform;
    const suggested = suggestThresholds(_state.latestResults);

    const thresholds = await promptThresholds(suggested);
    if (!thresholds) { return; }

    const content = generateCiWorkflow(platform, thresholds);
    const defaultPath = getDefaultOutputPath(platform);

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const targetPath = vscode.Uri.joinPath(folders[0].uri, defaultPath);

    let shouldWrite = true;
    try {
        await vscode.workspace.fs.stat(targetPath);
        const overwrite = await vscode.window.showWarningMessage(
            `${defaultPath} already exists. Overwrite?`,
            { modal: true },
            'Overwrite',
        );
        shouldWrite = overwrite === 'Overwrite';
    } catch {
        // File doesn't exist yet — ensure parent directory exists
        const parentDir = vscode.Uri.joinPath(targetPath, '..');
        try {
            await vscode.workspace.fs.stat(parentDir);
        } catch {
            await vscode.workspace.fs.createDirectory(parentDir);
        }
    }

    if (!shouldWrite) { return; }

    await vscode.workspace.fs.writeFile(targetPath, Buffer.from(content, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(targetPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`CI pipeline generated: ${defaultPath}`);
}

/** Prompt user to accept suggested thresholds or customize each one. */
export async function promptThresholds(
    suggested: CiThresholds,
): Promise<CiThresholds | undefined> {
    const summary = formatThresholdsSummary(suggested);

    const action = await vscode.window.showQuickPick(
        [
            {
                label: '$(check) Use suggested thresholds',
                description: summary,
                action: 'use',
            },
            {
                label: '$(edit) Customize thresholds...',
                description: 'Edit each threshold value',
                action: 'edit',
            },
        ],
        {
            title: 'Configure CI Thresholds',
            placeHolder: 'Based on current scan results',
        },
    );
    if (!action) { return undefined; }
    if (action.action === 'use') { return suggested; }

    const maxEol = await vscode.window.showInputBox({
        title: 'Max End-of-Life Packages',
        prompt: 'Maximum number of EOL packages allowed (current PRs with more will fail)',
        value: String(suggested.maxEndOfLife),
        validateInput: v => {
            const n = parseInt(v, 10);
            return isNaN(n) || n < 0 ? 'Enter a non-negative number' : undefined;
        },
    });
    if (maxEol === undefined) { return undefined; }

    const maxLegacy = await vscode.window.showInputBox({
        title: 'Max Legacy-Locked Packages',
        prompt: 'Maximum number of legacy-locked packages allowed',
        value: String(suggested.maxLegacyLocked),
        validateInput: v => {
            const n = parseInt(v, 10);
            return isNaN(n) || n < 0 ? 'Enter a non-negative number' : undefined;
        },
    });
    if (maxLegacy === undefined) { return undefined; }

    const minVibrancy = await vscode.window.showInputBox({
        title: 'Minimum Average Vibrancy',
        prompt: 'Minimum average vibrancy score (0-100) required',
        value: String(suggested.minAverageVibrancy),
        validateInput: v => {
            const n = parseInt(v, 10);
            return isNaN(n) || n < 0 || n > 100 ? 'Enter a number between 0 and 100' : undefined;
        },
    });
    if (minVibrancy === undefined) { return undefined; }

    const failOnVuln = await vscode.window.showQuickPick(
        [
            { label: 'Yes', description: 'Fail CI on known vulnerabilities', value: true },
            { label: 'No', description: 'Warn but do not fail', value: false },
        ],
        {
            title: 'Fail on Vulnerabilities?',
            placeHolder: 'Should the CI fail when vulnerabilities are detected?',
        },
    );
    if (!failOnVuln) { return undefined; }

    return {
        maxEndOfLife: parseInt(maxEol, 10),
        maxLegacyLocked: parseInt(maxLegacy, 10),
        minAverageVibrancy: parseInt(minVibrancy, 10),
        failOnVulnerability: failOnVuln.value,
    };
}
