import { PubDevPackageInfo } from '../types';
import { CacheService } from './cache-service';

const BASE_URL = 'https://pub.dev/api/packages';

/** Fetch package metadata from pub.dev. */
export async function fetchPackageInfo(
    name: string,
    cache?: CacheService,
): Promise<PubDevPackageInfo | null> {
    const cacheKey = `pub.info.${name}`;
    const cached = cache?.get<PubDevPackageInfo>(cacheKey);
    if (cached) { return cached; }

    try {
        const resp = await fetch(`${BASE_URL}/${name}`);
        if (!resp.ok) { return null; }

        const json: any = await resp.json();
        const latest = json.latest ?? {};
        const pubspec = latest.pubspec ?? {};

        const info: PubDevPackageInfo = {
            name: json.name ?? name,
            latestVersion: latest.version ?? '',
            publishedDate: latest.published ?? '',
            repositoryUrl: pubspec.repository ?? pubspec.homepage ?? null,
            isDiscontinued: json.isDiscontinued ?? false,
            isUnlisted: json.isUnlisted ?? false,
            pubPoints: 0,
        };

        await cache?.set(cacheKey, info);
        return info;
    } catch {
        return null;
    }
}

/** Fetch pub.dev score and return granted points. */
export async function fetchPackageScore(
    name: string,
    cache?: CacheService,
): Promise<number> {
    const cacheKey = `pub.score.${name}`;
    const cached = cache?.get<number>(cacheKey);
    if (cached !== null && cached !== undefined) { return cached; }

    try {
        const resp = await fetch(`${BASE_URL}/${name}/score`);
        if (!resp.ok) { return 0; }

        const json: any = await resp.json();
        const points = json.grantedPoints ?? 0;

        await cache?.set(cacheKey, points);
        return points;
    } catch {
        return 0;
    }
}
