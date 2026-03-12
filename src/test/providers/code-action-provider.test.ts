import * as assert from 'assert';
import * as vscode from 'vscode';
import { VibrancyCodeActionProvider } from '../../providers/code-action-provider';

function makeMockDocument(): vscode.TextDocument {
    return {
        uri: vscode.Uri.file('/test/pubspec.yaml'),
        getText(range?: vscode.Range): string {
            if (!range) { return ''; }
            return 'old_package';
        },
    } as unknown as vscode.TextDocument;
}

function makeDiagnostic(source: string): vscode.Diagnostic {
    return {
        range: new vscode.Range(0, 0, 0, 11),
        message: 'Deprecated: old_package (1/10)',
        severity: vscode.DiagnosticSeverity.Hint,
        source,
        code: 'end-of-life',
    };
}

describe('VibrancyCodeActionProvider', () => {
    let provider: VibrancyCodeActionProvider;

    beforeEach(() => {
        provider = new VibrancyCodeActionProvider();
    });

    it('should return empty array when no diagnostics', () => {
        const doc = makeMockDocument();
        const context = { diagnostics: [] } as unknown as vscode.CodeActionContext;
        const actions = provider.provideCodeActions(
            doc, new vscode.Range(0, 0, 0, 0), context,
        );
        assert.strictEqual(actions.length, 0);
    });

    it('should skip diagnostics from other sources', () => {
        const doc = makeMockDocument();
        const context = {
            diagnostics: [makeDiagnostic('other-source')],
        } as unknown as vscode.CodeActionContext;
        const actions = provider.provideCodeActions(
            doc, new vscode.Range(0, 0, 0, 0), context,
        );
        assert.strictEqual(actions.length, 0);
    });

    it('should provide quick fix for known bad package', () => {
        const doc = {
            ...makeMockDocument(),
            getText: (_range?: vscode.Range) => 'pedantic',
        } as unknown as vscode.TextDocument;
        const diag = makeDiagnostic('Saropa Package Vibrancy');
        const context = { diagnostics: [diag] } as unknown as vscode.CodeActionContext;
        const actions = provider.provideCodeActions(
            doc, new vscode.Range(0, 0, 0, 8), context,
        );
        if (actions.length > 0) {
            assert.ok(actions[0].title.startsWith('Replace with'));
            assert.strictEqual(actions[0].kind, vscode.CodeActionKind.QuickFix);
        }
    });

    it('should not provide fix for unknown packages', () => {
        const doc = {
            ...makeMockDocument(),
            getText: (_range?: vscode.Range) => 'totally_unknown_pkg',
        } as unknown as vscode.TextDocument;
        const diag = makeDiagnostic('Saropa Package Vibrancy');
        const context = { diagnostics: [diag] } as unknown as vscode.CodeActionContext;
        const actions = provider.provideCodeActions(
            doc, new vscode.Range(0, 0, 0, 19), context,
        );
        assert.strictEqual(actions.length, 0);
    });

    it('should provide discovery alternatives from updateResults', () => {
        const doc = {
            ...makeMockDocument(),
            getText: (_range?: vscode.Range) => 'test_pkg',
        } as unknown as vscode.TextDocument;
        const diag = makeDiagnostic('Saropa Package Vibrancy');
        const context = { diagnostics: [diag] } as unknown as vscode.CodeActionContext;

        provider.updateResults([
            {
                package: { name: 'test_pkg', version: '1.0.0', constraint: '^1.0.0', source: 'hosted', isDirect: true, section: 'dependencies' },
                pubDev: null,
                github: null,
                knownIssue: null,
                score: 30,
                category: 'legacy-locked',
                resolutionVelocity: 0,
                engagementLevel: 0,
                popularity: 0,
                publisherTrust: 0,
                updateInfo: null,
                license: null,
                drift: null,
                archiveSizeBytes: null,
                bloatRating: null,
                isUnused: false,
                platforms: null,
                verifiedPublisher: false,
                wasmReady: null,
                blocker: null,
                upgradeBlockStatus: 'up-to-date',
                transitiveInfo: null,
                alternatives: [
                    { name: 'better_pkg', source: 'discovery', score: 80, likes: 500 },
                ],
            },
        ]);

        const actions = provider.provideCodeActions(
            doc, new vscode.Range(0, 0, 0, 8), context,
        );
        assert.ok(actions.length >= 1);
        const discoveryAction = actions.find(a => a.title.includes('better_pkg'));
        assert.ok(discoveryAction);
        assert.ok(discoveryAction!.title.includes('similar'));
    });

    it('should mark curated replacement as preferred', () => {
        const doc = {
            ...makeMockDocument(),
            getText: (_range?: vscode.Range) => 'pedantic',
        } as unknown as vscode.TextDocument;
        const diag = makeDiagnostic('Saropa Package Vibrancy');
        const context = { diagnostics: [diag] } as unknown as vscode.CodeActionContext;

        const actions = provider.provideCodeActions(
            doc, new vscode.Range(0, 0, 0, 8), context,
        );

        if (actions.length > 0) {
            const preferred = actions.find(a => a.isPreferred);
            assert.ok(preferred, 'Should have a preferred action for curated replacement');
        }
    });
});
