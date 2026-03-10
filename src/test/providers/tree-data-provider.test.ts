import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { workspace } from '../vscode-mock';
import { VibrancyTreeProvider } from '../../providers/tree-data-provider';
import {
    PackageItem, DetailItem, SuppressedGroupItem, SuppressedPackageItem,
} from '../../providers/tree-items';
import { VibrancyResult } from '../../types';

function makeResult(
    name: string, score: number, updateStatus?: string,
): VibrancyResult {
    return {
        package: { name, version: '1.0.0', constraint: '^1.0.0', source: 'hosted', isDirect: true },
        pubDev: null,
        github: null,
        knownIssue: null,
        score,
        category: score >= 70 ? 'vibrant' : score >= 40 ? 'quiet' : 'legacy-locked',
        resolutionVelocity: 0,
        engagementLevel: 0,
        popularity: 0,
        publisherTrust: 0,
        updateInfo: updateStatus ? {
            currentVersion: '1.0.0',
            latestVersion: '2.0.0',
            updateStatus: updateStatus as any,
            changelog: null,
        } : null,
    };
}

describe('VibrancyTreeProvider', () => {
    let provider: VibrancyTreeProvider;

    beforeEach(() => {
        provider = new VibrancyTreeProvider();
    });

    it('should return empty array when no results', () => {
        assert.strictEqual(provider.getChildren().length, 0);
    });

    it('should return PackageItems at root', () => {
        provider.updateResults([makeResult('http', 80)]);
        const children = provider.getChildren();
        assert.strictEqual(children.length, 1);
        assert.ok(children[0] instanceof PackageItem);
    });

    it('should sort worst-first', () => {
        provider.updateResults([
            makeResult('good', 90),
            makeResult('bad', 20),
            makeResult('mid', 50),
        ]);
        const children = provider.getChildren() as PackageItem[];
        assert.strictEqual(children[0].result.package.name, 'bad');
        assert.strictEqual(children[2].result.package.name, 'good');
    });

    it('should return DetailItems as children of PackageItem', () => {
        provider.updateResults([makeResult('http', 80)]);
        const root = provider.getChildren() as PackageItem[];
        const details = provider.getChildren(root[0]);
        assert.ok(details.length > 0);
        assert.ok(details[0] instanceof DetailItem);
    });

    it('should fire onDidChangeTreeData on update', () => {
        let fired = false;
        provider.onDidChangeTreeData(() => { fired = true; });
        provider.updateResults([makeResult('http', 80)]);
        assert.ok(fired);
    });
});

describe('suppressed grouping', () => {
    let provider: VibrancyTreeProvider;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        provider = new VibrancyTreeProvider();
    });

    afterEach(() => {
        sandbox.restore();
    });

    function stubSuppressed(names: string[]): void {
        sandbox.stub(workspace, 'getConfiguration').returns({
            get: <T>(_key: string, _defaultValue?: T): T | undefined =>
                names as unknown as T,
            update: async () => {},
        });
    }

    it('should show SuppressedGroupItem when packages are suppressed', () => {
        stubSuppressed(['bad']);
        provider.updateResults([makeResult('bad', 20), makeResult('good', 90)]);
        const children = provider.getChildren();
        assert.strictEqual(children.length, 2);
        assert.ok(children[0] instanceof PackageItem);
        assert.ok(children[1] instanceof SuppressedGroupItem);
    });

    it('should return SuppressedPackageItems as children of group', () => {
        stubSuppressed(['bad']);
        provider.updateResults([makeResult('bad', 20), makeResult('good', 90)]);
        const group = provider.getChildren().find(
            c => c instanceof SuppressedGroupItem,
        )!;
        const suppressed = provider.getChildren(group);
        assert.strictEqual(suppressed.length, 1);
        assert.ok(suppressed[0] instanceof SuppressedPackageItem);
    });

    it('should show no group when none suppressed', () => {
        stubSuppressed([]);
        provider.updateResults([makeResult('good', 90)]);
        const children = provider.getChildren();
        assert.strictEqual(children.length, 1);
        assert.ok(children[0] instanceof PackageItem);
    });

    it('should show correct count in group label', () => {
        stubSuppressed(['a', 'b']);
        provider.updateResults([
            makeResult('a', 20), makeResult('b', 30), makeResult('c', 90),
        ]);
        const group = provider.getChildren().find(
            c => c instanceof SuppressedGroupItem,
        ) as SuppressedGroupItem;
        assert.strictEqual(group.label, 'Suppressed (2)');
    });

    it('should fire onDidChangeTreeData on refresh', () => {
        let fired = false;
        provider.onDidChangeTreeData(() => { fired = true; });
        provider.refresh();
        assert.ok(fired);
    });
});

describe('PackageItem', () => {
    it('should set contextValue to vibrancyPackage when no update', () => {
        const item = new PackageItem(makeResult('http', 80));
        assert.strictEqual(item.contextValue, 'vibrancyPackage');
    });

    it('should set contextValue to vibrancyPackageUpdatable when update available', () => {
        const item = new PackageItem(makeResult('http', 50, 'minor'));
        assert.strictEqual(item.contextValue, 'vibrancyPackageUpdatable');
    });

    it('should set contextValue to vibrancyPackage when up-to-date', () => {
        const item = new PackageItem(makeResult('http', 80, 'up-to-date'));
        assert.strictEqual(item.contextValue, 'vibrancyPackage');
    });

    it('should set goToPackage command with package name', () => {
        const item = new PackageItem(makeResult('http', 80));
        assert.strictEqual(item.command?.command, 'saropaPackageVibrancy.goToPackage');
        assert.deepStrictEqual(item.command?.arguments, ['http']);
    });
});

describe('SuppressedPackageItem', () => {
    it('should set suppressed contextValue when no update', () => {
        const item = new SuppressedPackageItem(makeResult('http', 80));
        assert.strictEqual(item.contextValue, 'vibrancyPackageSuppressed');
    });

    it('should set suppressed updatable contextValue when update available', () => {
        const item = new SuppressedPackageItem(makeResult('http', 50, 'minor'));
        assert.strictEqual(item.contextValue, 'vibrancyPackageSuppressedUpdatable');
    });

    it('should use eye-closed icon', () => {
        const item = new SuppressedPackageItem(makeResult('http', 80));
        const icon = item.iconPath as vscode.ThemeIcon;
        assert.strictEqual(icon.id, 'eye-closed');
    });
});
