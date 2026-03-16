/**
 * Main activation wiring — creates providers, registers commands, starts watchers.
 * Scan logic, command handlers, and suppress commands are in sibling modules.
 */
import * as vscode from 'vscode';
import { _state } from './activation-state';
import { CacheService } from './services/cache-service';
import { VibrancyTreeProvider } from './providers/tree-data-provider';
import { VibrancyDiagnostics } from './providers/diagnostics';
import { VibrancyCodeActionProvider } from './providers/code-action-provider';
import { VibrancyCodeLensProvider, setCodeLensToggle, setPrereleaseToggle } from './providers/codelens-provider';
import { VibrancyHoverProvider } from './providers/hover-provider';
import { VibrancyStatusBar } from './ui/status-bar';
import { CodeLensToggle } from './ui/codelens-toggle';
import { PrereleaseToggle } from './ui/prerelease-toggle';
import { DetailViewProvider, DETAIL_VIEW_ID } from './views/detail-view-provider';
import { DetailLogger, DETAIL_CHANNEL_NAME } from './services/detail-logger';
import { VibrancyResult } from './types';
import { VibrancyStateManager } from './state';
import { registerTreeCommands } from './providers/tree-commands';
import { registerUpgradeCommand } from './providers/upgrade-command';
import { registerAnnotateCommand } from './providers/annotate-command';
import { AdoptionGateProvider } from './providers/adoption-gate';
import { FreshnessWatcher } from './services/freshness-watcher';
import { SaveTaskRunner } from './services/save-task-runner';
import { RegistryService } from './services/registry-service';
import { registerRegistryCommands } from './providers/registry-commands';
import { clearIndicatorCache } from './services/indicator-config';
import { ProblemTreeProvider, registerProblemTreeView } from './providers/problem-tree-provider';
import { autoScanIfPubspec, runScan, updateFilteredTargets } from './scan-runner';
import { registerCommands } from './command-handlers';
import { handleNewVersions } from './command-handlers';

// Re-export for backward compatibility — external modules import these from here
export {
    getLatestResults, getLatestInsights, getStateManager,
    getRegistryService, getProblemRegistry, stopFreshnessWatcher,
} from './activation-state';

/** Dependencies injected into scan pipeline and command handlers. */
export interface ScanTargets {
    tree: VibrancyTreeProvider;
    hover: VibrancyHoverProvider;
    codeLens: VibrancyCodeLensProvider;
    codeActions: VibrancyCodeActionProvider;
    statusBar: VibrancyStatusBar;
    diagnostics: VibrancyDiagnostics;
    cache: CacheService;
    adoptionGate: AdoptionGateProvider;
    codeLensToggle: CodeLensToggle;
    prereleaseToggle: PrereleaseToggle;
    state: VibrancyStateManager;
}

/** Main activation wiring. */
export function runActivation(context: vscode.ExtensionContext): void {
    const cache = new CacheService(context.globalState);
    _state.registryService = new RegistryService(context.secrets);
    context.subscriptions.push(_state.registryService);

    const treeProvider = new VibrancyTreeProvider();
    const hoverProvider = new VibrancyHoverProvider();
    const codeLensProvider = new VibrancyCodeLensProvider();
    const codeLensToggle = new CodeLensToggle();
    const prereleaseToggle = new PrereleaseToggle();
    const statusBar = new VibrancyStatusBar();
    const diagCollection = vscode.languages.createDiagnosticCollection(
        'saropa-vibrancy',
    );
    const diagnostics = new VibrancyDiagnostics(diagCollection);

    _state.stateManager = new VibrancyStateManager();

    setCodeLensToggle(codeLensToggle);
    setPrereleaseToggle(prereleaseToggle);
    codeLensToggle.onDidChange(enabled => {
        if (_state.stateManager) {
            _state.stateManager.codeLensEnabled.value = enabled;
        }
        codeLensProvider.refresh();
    });
    prereleaseToggle.onDidChange(() => {
        codeLensProvider.refresh();
        treeProvider.refresh();
    });

    context.subscriptions.push(diagCollection, statusBar, codeLensToggle, prereleaseToggle, _state.stateManager);

    const adoptionGate = new AdoptionGateProvider(cache);
    adoptionGate.register(context);

    const codeActionProvider = new VibrancyCodeActionProvider();

    _state.freshnessWatcher = new FreshnessWatcher(cache);
    _state.freshnessWatcher.setOnNewVersions(handleNewVersions);

    _state.saveTaskRunner = new SaveTaskRunner();
    context.subscriptions.push(_state.saveTaskRunner);

    const targets: ScanTargets = {
        tree: treeProvider, hover: hoverProvider,
        codeLens: codeLensProvider, codeActions: codeActionProvider,
        statusBar, diagnostics, cache, adoptionGate, codeLensToggle,
        prereleaseToggle, state: _state.stateManager,
    };

    _state.detailViewProvider = new DetailViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DETAIL_VIEW_ID, _state.detailViewProvider),
    );

    _state.detailChannel = vscode.window.createOutputChannel(DETAIL_CHANNEL_NAME);
    _state.detailLogger = new DetailLogger(_state.detailChannel);
    context.subscriptions.push(_state.detailChannel);

    _state.problemTreeProvider = new ProblemTreeProvider();
    const problemTreeView = registerProblemTreeView(context, _state.problemTreeProvider);
    syncDetailOnSelection(problemTreeView, item => {
        if ('pkgProblems' in (item as object)) {
            return treeProvider.getResultByName(
                (item as { pkgProblems: { package: string } }).pkgProblems.package,
            );
        }
        return undefined;
    });

    registerTreeView(context, treeProvider);
    registerProviders(context, hoverProvider, codeLensProvider, codeActionProvider);
    registerCommands(context, targets);
    registerTreeCommands(context, _state.detailViewProvider, _state.detailLogger);
    registerUpgradeCommand(context);
    registerAnnotateCommand(context);
    registerRegistryCommands(context, _state.registryService);
    registerFileWatcher(context, targets);
    registerSuppressListener(context, targets);
    registerConfigListener(context, codeLensProvider, treeProvider);
    autoScanIfPubspec(targets);
}

function registerFileWatcher(
    context: vscode.ExtensionContext,
    targets: ScanTargets,
): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/pubspec.lock');
    watcher.onDidChange(() => runScan(targets));
    context.subscriptions.push(watcher);
}

function registerSuppressListener(
    context: vscode.ExtensionContext,
    targets: ScanTargets,
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration('saropaPackageVibrancy.suppressedPackages')) {
                return;
            }
            targets.tree.refresh();
            if (_state.lastParsedDeps && _state.latestResults.length > 0) {
                updateFilteredTargets(targets, _state.latestResults, _state.lastParsedDeps);
            }
        }),
    );
}

function registerConfigListener(
    context: vscode.ExtensionContext,
    codeLensProvider: VibrancyCodeLensProvider,
    treeProvider: VibrancyTreeProvider,
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('saropaPackageVibrancy.indicators')
                || e.affectsConfiguration('saropaPackageVibrancy.indicatorStyle')) {
                clearIndicatorCache();
                codeLensProvider.refresh();
            }
            if (e.affectsConfiguration('saropaPackageVibrancy.showPrereleases')
                || e.affectsConfiguration('saropaPackageVibrancy.prereleaseTagFilter')) {
                codeLensProvider.refresh();
                treeProvider.refresh();
            }
        }),
    );
}

function registerTreeView(
    context: vscode.ExtensionContext,
    provider: VibrancyTreeProvider,
): void {
    const tv = vscode.window.createTreeView(
        'saropaPackageVibrancy.packages',
        { treeDataProvider: provider },
    );
    tv.description = `v${context.extension.packageJSON.version}`;
    context.subscriptions.push(tv);

    syncDetailOnSelection(tv, item => {
        if ('result' in (item as object)) {
            return (item as { result: VibrancyResult }).result;
        }
        if ('insight' in (item as object)) {
            return provider.getResultByName(
                (item as { insight: { name: string } }).insight.name,
            );
        }
        if ('analysis' in (item as object)) {
            return provider.getResultByName(
                (item as { analysis: { entry: { name: string } } }).analysis.entry.name,
            );
        }
        return undefined;
    });
}

/** Wire a tree view selection to the Package Details panel. */
function syncDetailOnSelection(
    tv: vscode.TreeView<unknown>,
    resolve: (item: unknown) => VibrancyResult | undefined,
): void {
    tv.onDidChangeSelection(e => {
        if (!_state.detailViewProvider) { return; }
        if (e.selection.length !== 1) {
            _state.detailViewProvider.clear();
            return;
        }
        const result = resolve(e.selection[0]);
        if (result) {
            _state.detailViewProvider.update(result);
        } else {
            _state.detailViewProvider.clear();
        }
    });
}

function registerProviders(
    context: vscode.ExtensionContext,
    hoverProvider: VibrancyHoverProvider,
    codeLensProvider: VibrancyCodeLensProvider,
    codeActionProvider: VibrancyCodeActionProvider,
): void {
    const pubspecSelector = { language: 'yaml', pattern: '**/pubspec.yaml' };

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(pubspecSelector, hoverProvider),
        vscode.languages.registerCodeActionsProvider(
            pubspecSelector,
            codeActionProvider,
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
        ),
        vscode.languages.registerCodeLensProvider(
            pubspecSelector, codeLensProvider,
        ),
    );
}
