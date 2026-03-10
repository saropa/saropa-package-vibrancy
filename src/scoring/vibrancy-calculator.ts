import { GitHubMetrics } from '../types';

const W_R = 0.5;
const W_E = 0.4;
const W_P = 0.1;

function clamp(value: number): number {
    return Math.min(100, Math.max(0, value));
}

function normalize(value: number, max: number): number {
    if (max <= 0) { return 0; }
    return clamp((value / max) * 100);
}

/** Resolution Velocity: closed issues + merged PRs in 90 days. */
export function calcResolutionVelocity(metrics: GitHubMetrics): number {
    const closureRate = metrics.closedIssuesLast90d + metrics.mergedPrsLast90d;
    const recencyBonus = clamp(100 - metrics.daysSinceLastClose);
    return clamp((normalize(closureRate, 50) + recencyBonus) / 2);
}

/** Engagement Level: comment volume + recency. */
export function calcEngagementLevel(metrics: GitHubMetrics): number {
    const commentScore = normalize(metrics.avgCommentsPerIssue, 10);
    const recencyScore = clamp(100 - metrics.daysSinceLastUpdate);
    return clamp((commentScore + recencyScore) / 2);
}

/** Popularity: pub.dev points + GitHub stars. */
export function calcPopularity(pubPoints: number, stars: number): number {
    const pointsNorm = normalize(pubPoints, 150);
    const starsNorm = normalize(stars, 5000);
    return clamp((pointsNorm + starsNorm) / 2);
}

/** Compute overall vibrancy score (0-100). */
export function computeVibrancyScore(params: {
    resolutionVelocity: number;
    engagementLevel: number;
    popularity: number;
}): number {
    const raw = (W_R * params.resolutionVelocity)
        + (W_E * params.engagementLevel)
        + (W_P * params.popularity);
    return Math.round(clamp(raw) * 10) / 10;
}
