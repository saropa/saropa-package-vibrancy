import * as assert from 'assert';
import { VibrancyTreeProvider } from '../../providers/tree-data-provider';
import { PackageItem, DetailItem } from '../../providers/tree-items';
import { VibrancyResult } from '../../types';

function makeResult(name: string, score: number): VibrancyResult {
    return {
        package: { name, version: '1.0.0', source: 'hosted', isDirect: true },
        pubDev: null,
        github: null,
        knownIssue: null,
        score,
        category: score >= 70 ? 'vibrant' : score >= 40 ? 'quiet' : 'legacy-locked',
        resolutionVelocity: 0,
        engagementLevel: 0,
        popularity: 0,
        updateInfo: null,
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
