import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
    clipboardMock, envMock, messageMock, resetMocks, workspace,
} from '../vscode-mock';
import { registerTreeCommands } from '../../providers/tree-commands';
import { PackageItem } from '../../providers/tree-items';
import { VibrancyResult } from '../../types';

function makeResult(
    name: string, score: number, latestVersion?: string,
): VibrancyResult {
    return {
        package: { name, version: '1.0.0', constraint: '^1.0.0', source: 'hosted', isDirect: true },
        pubDev: null,
        github: null,
        knownIssue: null,
        score,
        category: score >= 70 ? 'vibrant' : 'quiet',
        resolutionVelocity: 0,
        engagementLevel: 0,
        popularity: 0,
        publisherTrust: 0,
        updateInfo: latestVersion ? {
            currentVersion: '1.0.0',
            latestVersion,
            updateStatus: 'major' as const,
            changelog: null,
        } : null,
    };
}

function makeMockContext(): vscode.ExtensionContext {
    const subs: { dispose: () => void }[] = [];
    return { subscriptions: subs } as unknown as vscode.ExtensionContext;
}

describe('tree-commands', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        resetMocks();
        registerTreeCommands(makeMockContext());
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('copyAsJson', () => {
        it('should copy result JSON to clipboard', async () => {
            const result = makeResult('http', 80);
            const item = new PackageItem(result);
            await vscode.commands.executeCommand(
                'saropaPackageVibrancy.copyAsJson', item,
            );
            const parsed = JSON.parse(clipboardMock.text);
            assert.strictEqual(parsed.package.name, 'http');
            assert.strictEqual(parsed.score, 80);
        });

        it('should show confirmation message', async () => {
            const item = new PackageItem(makeResult('bloc', 60));
            await vscode.commands.executeCommand(
                'saropaPackageVibrancy.copyAsJson', item,
            );
            assert.strictEqual(messageMock.infos.length, 1);
            assert.ok(messageMock.infos[0].includes('bloc'));
        });
    });

    describe('openOnPubDev', () => {
        it('should open pub.dev URL for the package', async () => {
            const item = new PackageItem(makeResult('http', 80));
            await vscode.commands.executeCommand(
                'saropaPackageVibrancy.openOnPubDev', item,
            );
            assert.strictEqual(envMock.openedUrls.length, 1);
            assert.ok(envMock.openedUrls[0].includes('pub.dev/packages/http'));
        });
    });

    describe('goToPackage', () => {
        it('should do nothing when no pubspec.yaml found', async () => {
            sandbox.stub(workspace, 'findFiles').resolves([]);
            await vscode.commands.executeCommand(
                'saropaPackageVibrancy.goToPackage', 'http',
            );
            // No error thrown — graceful no-op
        });

        it('should open document and navigate to package line', async () => {
            const fakeUri = vscode.Uri.file('/test/pubspec.yaml');
            sandbox.stub(workspace, 'findFiles').resolves([fakeUri]);

            const fakeDoc = {
                getText: () => 'dependencies:\n  http: ^1.0.0\n  bloc: ^2.0.0',
                fileName: '/test/pubspec.yaml',
            };
            sandbox.stub(workspace, 'openTextDocument').resolves(fakeDoc);

            let shownDoc: any = null;
            let shownOptions: any = null;
            sandbox.stub(vscode.window, 'showTextDocument').callsFake(
                async (doc: any, options?: any) => {
                    shownDoc = doc;
                    shownOptions = options;
                    return {} as any;
                },
            );

            await vscode.commands.executeCommand(
                'saropaPackageVibrancy.goToPackage', 'http',
            );

            assert.strictEqual(shownDoc, fakeDoc);
            assert.ok(shownOptions?.selection);
        });
    });

    describe('updateToLatest', () => {
        it('should do nothing when no latest version', async () => {
            const item = new PackageItem(makeResult('http', 80));
            await vscode.commands.executeCommand(
                'saropaPackageVibrancy.updateToLatest', item,
            );
            // No error — graceful no-op since updateInfo is null
        });

        it('should show warning when package line not found', async () => {
            const result = makeResult('http', 50, '2.0.0');
            const item = new PackageItem(result);

            const fakeUri = vscode.Uri.file('/test/pubspec.yaml');
            sandbox.stub(workspace, 'findFiles').resolves([fakeUri]);

            const fakeDoc = {
                getText: () => 'dependencies:\n  bloc: ^1.0.0',
                lineCount: 2,
                lineAt: (i: number) => ({
                    text: ['dependencies:', '  bloc: ^1.0.0'][i] ?? '',
                }),
            };
            sandbox.stub(workspace, 'openTextDocument').resolves(fakeDoc);

            await vscode.commands.executeCommand(
                'saropaPackageVibrancy.updateToLatest', item,
            );

            assert.strictEqual(messageMock.warnings.length, 1);
            assert.ok(messageMock.warnings[0].includes('http'));
        });
    });
});
