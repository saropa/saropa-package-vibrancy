import * as assert from 'assert';
import {
    calcResolutionVelocity,
    calcEngagementLevel,
    calcPopularity,
    calcPublishRecency,
    computeVibrancyScore,
} from '../../scoring/vibrancy-calculator';
import { GitHubMetrics } from '../../types';

function makeMetrics(overrides: Partial<GitHubMetrics> = {}): GitHubMetrics {
    return {
        stars: 100,
        openIssues: 10,
        closedIssuesLast90d: 5,
        mergedPrsLast90d: 3,
        avgCommentsPerIssue: 2,
        daysSinceLastUpdate: 10,
        daysSinceLastClose: 5,
        ...overrides,
    };
}

describe('vibrancy-calculator', () => {
    describe('calcResolutionVelocity', () => {
        it('should return high score for active repos', () => {
            const score = calcResolutionVelocity(makeMetrics({
                closedIssuesLast90d: 30,
                mergedPrsLast90d: 20,
                daysSinceLastClose: 1,
            }));
            assert.ok(score > 70);
        });

        it('should return low score for inactive repos', () => {
            const score = calcResolutionVelocity(makeMetrics({
                closedIssuesLast90d: 0,
                mergedPrsLast90d: 0,
                daysSinceLastClose: 999,
            }));
            assert.ok(score < 10);
        });

        it('should stay within 0-100', () => {
            const high = calcResolutionVelocity(makeMetrics({
                closedIssuesLast90d: 1000,
                mergedPrsLast90d: 1000,
                daysSinceLastClose: 0,
            }));
            assert.ok(high >= 0 && high <= 100);
        });
    });

    describe('calcEngagementLevel', () => {
        it('should reward high comment volume and recency', () => {
            const score = calcEngagementLevel(makeMetrics({
                avgCommentsPerIssue: 8,
                daysSinceLastUpdate: 2,
            }));
            assert.ok(score > 60);
        });

        it('should penalize stale repos', () => {
            const score = calcEngagementLevel(makeMetrics({
                avgCommentsPerIssue: 0,
                daysSinceLastUpdate: 500,
            }));
            assert.ok(score < 10);
        });

        it('should boost stale repos with recent publish date', () => {
            const without = calcEngagementLevel(makeMetrics({
                avgCommentsPerIssue: 1,
                daysSinceLastUpdate: 300,
            }));
            const with180d = calcEngagementLevel(makeMetrics({
                avgCommentsPerIssue: 1,
                daysSinceLastUpdate: 300,
            }), 180);
            assert.ok(with180d > without,
                `publish recency should boost: ${with180d} > ${without}`);
        });

        it('should not boost when publish date is older than 365 days', () => {
            const without = calcEngagementLevel(makeMetrics({
                avgCommentsPerIssue: 0,
                daysSinceLastUpdate: 500,
            }));
            const withOld = calcEngagementLevel(makeMetrics({
                avgCommentsPerIssue: 0,
                daysSinceLastUpdate: 500,
            }), 400);
            assert.strictEqual(withOld, without);
        });

        it('should not change score when publish date is absent', () => {
            const metrics = makeMetrics({ daysSinceLastUpdate: 200 });
            const withUndef = calcEngagementLevel(metrics, undefined);
            const without = calcEngagementLevel(metrics);
            assert.strictEqual(withUndef, without);
        });
    });

    describe('calcPublishRecency', () => {
        it('should return 100 for just-published packages', () => {
            assert.strictEqual(calcPublishRecency(0), 100);
        });

        it('should return ~50 for 6-month-old packages', () => {
            const score = calcPublishRecency(180);
            assert.ok(score > 45 && score < 55, `expected ~50, got ${score}`);
        });

        it('should return 0 for packages older than 365 days', () => {
            assert.strictEqual(calcPublishRecency(365), 0);
            assert.strictEqual(calcPublishRecency(500), 0);
        });
    });

    describe('calcPopularity', () => {
        it('should combine pub points and stars', () => {
            const score = calcPopularity(140, 3000);
            assert.ok(score > 50);
        });

        it('should return 0 for zero inputs', () => {
            assert.strictEqual(calcPopularity(0, 0), 0);
        });
    });

    describe('computeVibrancyScore', () => {
        it('should compute weighted average with defaults', () => {
            const score = computeVibrancyScore({
                resolutionVelocity: 80,
                engagementLevel: 60,
                popularity: 50,
            });
            // 0.5*80 + 0.4*60 + 0.1*50 = 40 + 24 + 5 = 69
            assert.strictEqual(score, 69);
        });

        it('should clamp to 0-100', () => {
            const score = computeVibrancyScore({
                resolutionVelocity: 100,
                engagementLevel: 100,
                popularity: 100,
            });
            assert.ok(score <= 100);
        });

        it('should apply custom weights', () => {
            const score = computeVibrancyScore(
                { resolutionVelocity: 100, engagementLevel: 0, popularity: 0 },
                { resolutionVelocity: 1.0, engagementLevel: 0, popularity: 0 },
            );
            assert.strictEqual(score, 100);
        });

        it('should allow popularity-heavy weights', () => {
            const score = computeVibrancyScore(
                { resolutionVelocity: 0, engagementLevel: 0, popularity: 80 },
                { resolutionVelocity: 0, engagementLevel: 0, popularity: 1.0 },
            );
            assert.strictEqual(score, 80);
        });

        it('should produce different scores with different weights', () => {
            const params = {
                resolutionVelocity: 90,
                engagementLevel: 30,
                popularity: 10,
            };
            const defaultScore = computeVibrancyScore(params);
            const evenScore = computeVibrancyScore(params, {
                resolutionVelocity: 0.33,
                engagementLevel: 0.34,
                popularity: 0.33,
            });
            assert.notStrictEqual(defaultScore, evenScore);
        });

        it('should return 0 when all inputs are 0', () => {
            const score = computeVibrancyScore(
                { resolutionVelocity: 0, engagementLevel: 0, popularity: 0 },
            );
            assert.strictEqual(score, 0);
        });
    });
});
