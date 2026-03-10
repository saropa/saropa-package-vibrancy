import { GitHubMetrics } from '../types';

/**
 * Default scoring weights for the vibrancy formula:
 *   V_score = (W_R * Resolution) + (W_E * Engagement) + (W_P * Popularity)
 *
 * Resolution and Engagement are heavily weighted because active maintainer
 * response matters more than historical star counts. These can be overridden
 * via VS Code settings (saropaPackageVibrancy.weights.*).
 */

/** Weight for Resolution Velocity (closed issues + merged PRs). */
export const DEFAULT_WEIGHT_RESOLUTION = 0.5;

/** Weight for Engagement Level (comment volume + discussion recency). */
export const DEFAULT_WEIGHT_ENGAGEMENT = 0.4;

/** Weight for Popularity (pub.dev points + GitHub stars). */
export const DEFAULT_WEIGHT_POPULARITY = 0.1;

/** User-configurable scoring weights. Must sum to ~1.0 for meaningful scores. */
export interface ScoringWeights {
    readonly resolutionVelocity: number;
    readonly engagementLevel: number;
    readonly popularity: number;
}

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
export function computeVibrancyScore(
    params: {
        resolutionVelocity: number;
        engagementLevel: number;
        popularity: number;
    },
    weights?: ScoringWeights,
): number {
    const wR = weights?.resolutionVelocity ?? DEFAULT_WEIGHT_RESOLUTION;
    const wE = weights?.engagementLevel ?? DEFAULT_WEIGHT_ENGAGEMENT;
    const wP = weights?.popularity ?? DEFAULT_WEIGHT_POPULARITY;

    const raw = (wR * params.resolutionVelocity)
        + (wE * params.engagementLevel)
        + (wP * params.popularity);
    return Math.round(clamp(raw) * 10) / 10;
}
