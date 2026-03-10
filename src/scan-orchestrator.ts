import { VibrancyResult, PackageDependency } from './types';
import { CacheService } from './services/cache-service';
import { fetchPackageInfo, fetchPackageScore } from './services/pub-dev-api';
import { extractGitHubRepo, fetchRepoMetrics } from './services/github-api';
import { findKnownIssue } from './scoring/known-issues';
import {
    calcResolutionVelocity,
    calcEngagementLevel,
    calcPopularity,
    computeVibrancyScore,
} from './scoring/vibrancy-calculator';
import { classifyStatus } from './scoring/status-classifier';

/** Analyze a single package and compute its vibrancy result. */
export async function analyzePackage(
    dep: PackageDependency,
    params: { cache: CacheService; githubToken?: string },
): Promise<VibrancyResult> {
    const knownIssue = findKnownIssue(dep.name);
    const pubDev = await fetchPackageInfo(dep.name, params.cache);
    const pubPoints = await fetchPackageScore(dep.name, params.cache);

    let github = null;
    if (pubDev?.repositoryUrl) {
        const parsed = extractGitHubRepo(pubDev.repositoryUrl);
        if (parsed) {
            github = await fetchRepoMetrics(parsed.owner, parsed.repo, {
                token: params.githubToken,
                cache: params.cache,
            });
        }
    }

    const resolutionVelocity = github
        ? calcResolutionVelocity(github) : 0;
    const engagementLevel = github
        ? calcEngagementLevel(github) : 0;
    const popularity = calcPopularity(pubPoints, github?.stars ?? 0);

    const score = computeVibrancyScore({
        resolutionVelocity,
        engagementLevel,
        popularity,
    });

    const pubDevWithPoints = pubDev
        ? { ...pubDev, pubPoints } : null;

    const category = classifyStatus({
        score,
        knownIssue,
        pubDev: pubDevWithPoints,
    });

    return {
        package: dep,
        pubDev: pubDevWithPoints,
        github,
        knownIssue,
        score,
        category,
        resolutionVelocity,
        engagementLevel,
        popularity,
    };
}
