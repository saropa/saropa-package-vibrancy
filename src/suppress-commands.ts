/** Package suppress/unsuppress command handlers. */
import * as vscode from 'vscode';
import { _state } from './activation-state';
import type { ScanTargets } from './extension-activation';
import {
    addSuppressedPackage, addSuppressedPackages, clearSuppressedPackages,
} from './services/config-service';
import { updateFilteredTargets } from './scan-runner';

/** Suppress a single package by name and refresh UI. */
export async function suppressPackageByName(
    packageName: string,
    targets: ScanTargets,
): Promise<void> {
    await addSuppressedPackage(packageName);
    vscode.window.showInformationMessage(
        `Suppressed "${packageName}" — diagnostics will be hidden`,
    );
    if (_state.lastParsedDeps) {
        updateFilteredTargets(targets, _state.latestResults, _state.lastParsedDeps);
    }
}

/** Show quick-pick to suppress packages by vibrancy category. */
export async function suppressByCategory(targets: ScanTargets): Promise<void> {
    if (_state.latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }

    const items: vscode.QuickPickItem[] = [
        {
            label: '$(warning) End of Life packages',
            description: `${countCategory('end-of-life')} packages`,
            detail: 'Suppress all packages marked as end-of-life',
        },
        {
            label: '$(info) Legacy-Locked packages',
            description: `${countCategory('legacy-locked')} packages`,
            detail: 'Suppress all packages marked as legacy-locked',
        },
        {
            label: '$(question) Quiet packages',
            description: `${countCategory('quiet')} packages`,
            detail: 'Suppress all packages with low activity',
        },
        {
            label: '$(circle-slash) All Blocked packages',
            description: `${countBlocked()} packages`,
            detail: 'Suppress packages that cannot be upgraded due to blockers',
        },
    ];

    const selection = await vscode.window.showQuickPick(items, {
        title: 'Suppress Packages by Category',
        placeHolder: 'Select which packages to suppress',
    });
    if (!selection) { return; }

    let toSuppress: string[] = [];
    if (selection.label.includes('End of Life')) {
        toSuppress = getPackagesByCategory('end-of-life');
    } else if (selection.label.includes('Legacy-Locked')) {
        toSuppress = getPackagesByCategory('legacy-locked');
    } else if (selection.label.includes('Quiet')) {
        toSuppress = getPackagesByCategory('quiet');
    } else if (selection.label.includes('Blocked')) {
        toSuppress = getBlockedPackages();
    }

    if (toSuppress.length === 0) {
        vscode.window.showInformationMessage('No packages to suppress');
        return;
    }

    const count = await addSuppressedPackages(toSuppress);
    vscode.window.showInformationMessage(`Suppressed ${count} package(s)`);
    if (_state.lastParsedDeps) {
        updateFilteredTargets(targets, _state.latestResults, _state.lastParsedDeps);
    }
}

/** Suppress all unhealthy packages after confirmation. */
export async function suppressAllProblems(targets: ScanTargets): Promise<void> {
    if (_state.latestResults.length === 0) {
        vscode.window.showWarningMessage('Run a scan first');
        return;
    }

    const unhealthy = _state.latestResults
        .filter(r => r.category !== 'vibrant')
        .map(r => r.package.name);

    if (unhealthy.length === 0) {
        vscode.window.showInformationMessage('No unhealthy packages to suppress');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Suppress all ${unhealthy.length} unhealthy packages? This will hide all diagnostics.`,
        { modal: true },
        'Suppress All',
    );
    if (confirm !== 'Suppress All') { return; }

    const count = await addSuppressedPackages(unhealthy);
    vscode.window.showInformationMessage(`Suppressed ${count} package(s)`);
    if (_state.lastParsedDeps) {
        updateFilteredTargets(targets, _state.latestResults, _state.lastParsedDeps);
    }
}

/** Clear all suppressed packages and refresh UI. */
export async function unsuppressAll(targets: ScanTargets): Promise<void> {
    const count = await clearSuppressedPackages();
    if (count === 0) {
        vscode.window.showInformationMessage('No suppressed packages');
        return;
    }
    vscode.window.showInformationMessage(`Unsuppressed ${count} package(s)`);
    if (_state.lastParsedDeps) {
        updateFilteredTargets(targets, _state.latestResults, _state.lastParsedDeps);
    }
}

/** Count packages in a specific vibrancy category. */
function countCategory(category: string): number {
    return _state.latestResults.filter(r => r.category === category).length;
}

/** Count packages blocked by upgrade blockers. */
function countBlocked(): number {
    return _state.latestResults.filter(r => r.blocker !== undefined).length;
}

/** Get package names for a specific vibrancy category. */
function getPackagesByCategory(category: string): string[] {
    return _state.latestResults
        .filter(r => r.category === category)
        .map(r => r.package.name);
}

/** Get package names blocked by upgrade blockers. */
function getBlockedPackages(): string[] {
    return _state.latestResults
        .filter(r => r.blocker !== undefined)
        .map(r => r.package.name);
}
