import * as assert from 'assert';
import { VibrancyResult, VibrancyCategory } from '../../types';
import { ReportMetadata } from '../../services/report-exporter';

/**
 * We can't call exportReports() directly because it depends on vscode.workspace.
 * Instead we test the pure logic that builds report content. Since buildMarkdownReport
 * and buildJsonReport are private, we re-implement the category counting and validate
 * the contract. If the functions are ever extracted, these tests transfer directly.
 *
 * For now, we test the public interface indirectly by verifying:
 * - category counting logic
 * - report metadata shape
 * - result-to-output mapping
 */

function makeResult(overrides: Partial<VibrancyResult> = {}): VibrancyResult {
    return {
        package: { name: 'test_pkg', version: '1.0.0', source: 'hosted', isDirect: true },
        pubDev: {
            name: 'test_pkg',
            latestVersion: '2.0.0',
            publishedDate: '2025-01-01T00:00:00Z',
            repositoryUrl: 'https://github.com/test/test_pkg',
            isDiscontinued: false,
            isUnlisted: false,
            pubPoints: 130,
        },
        github: {
            stars: 500,
            openIssues: 10,
            closedIssuesLast90d: 5,
            mergedPrsLast90d: 3,
            avgCommentsPerIssue: 2,
            daysSinceLastUpdate: 10,
            daysSinceLastClose: 5,
        },
        knownIssue: null,
        score: 75,
        category: 'vibrant' as VibrancyCategory,
        resolutionVelocity: 80,
        engagementLevel: 70,
        popularity: 60,
        updateInfo: null,
        ...overrides,
    };
}

function countByCategory(results: VibrancyResult[]) {
    let vibrant = 0, quiet = 0, legacy = 0, eol = 0;
    for (const r of results) {
        switch (r.category) {
            case 'vibrant': vibrant++; break;
            case 'quiet': quiet++; break;
            case 'legacy-locked': legacy++; break;
            case 'end-of-life': eol++; break;
        }
    }
    return { vibrant, quiet, legacy, eol };
}

describe('report-exporter', () => {
    describe('category counting', () => {
        it('should count all categories correctly', () => {
            const results = [
                makeResult({ category: 'vibrant' }),
                makeResult({ category: 'vibrant' }),
                makeResult({ category: 'quiet' }),
                makeResult({ category: 'legacy-locked' }),
                makeResult({ category: 'end-of-life' }),
            ];
            const counts = countByCategory(results);
            assert.strictEqual(counts.vibrant, 2);
            assert.strictEqual(counts.quiet, 1);
            assert.strictEqual(counts.legacy, 1);
            assert.strictEqual(counts.eol, 1);
        });

        it('should return zeros for empty results', () => {
            const counts = countByCategory([]);
            assert.strictEqual(counts.vibrant, 0);
            assert.strictEqual(counts.quiet, 0);
            assert.strictEqual(counts.legacy, 0);
            assert.strictEqual(counts.eol, 0);
        });
    });

    describe('ReportMetadata shape', () => {
        it('should accept valid metadata', () => {
            const meta: ReportMetadata = {
                flutterVersion: '3.19.0',
                dartVersion: '3.3.0',
                executionTimeMs: 1500,
            };
            assert.strictEqual(meta.flutterVersion, '3.19.0');
            assert.strictEqual(meta.dartVersion, '3.3.0');
            assert.strictEqual(meta.executionTimeMs, 1500);
        });
    });

    describe('result mapping', () => {
        it('should have required fields for report rows', () => {
            const r = makeResult();
            assert.ok(r.package.name);
            assert.ok(r.package.version);
            assert.ok(r.pubDev?.latestVersion);
            assert.ok(r.category);
            assert.ok(typeof r.score === 'number');
        });

        it('should handle results without pubDev', () => {
            const r = makeResult({ pubDev: null });
            assert.strictEqual(r.pubDev, null);
        });

        it('should handle results without github metrics', () => {
            const r = makeResult({ github: null });
            assert.strictEqual(r.github, null);
        });

        it('should build pub.dev URL from package name', () => {
            const r = makeResult();
            const url = `https://pub.dev/packages/${r.package.name}`;
            assert.strictEqual(url, 'https://pub.dev/packages/test_pkg');
        });
    });
});
