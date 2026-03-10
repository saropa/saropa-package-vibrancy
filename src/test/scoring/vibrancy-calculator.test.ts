import * as assert from 'assert';
import {
    calcResolutionVelocity,
    calcEngagementLevel,
    calcPopularity,
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
        it('should compute weighted average', () => {
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
    });
});
