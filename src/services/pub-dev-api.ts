import { PubDevPackageInfo } from '../types';
import { CacheService } from './cache-service';
import { ScanLogger } from './scan-logger';
import { fetchWithRetry } from './fetch-retry';

const BASE_URL = 'https://pub.dev/api/packages';

/** Fetch package metadata from pub.dev. */
export async function fetchPackageInfo(
    name: string,
    cache?: CacheService,
    logger?: ScanLogger,
): Promise<PubDevPackageInfo | null> {
    const cacheKey = `pub.info.${name}`;
    const cached = cache?.get<PubDevPackageInfo>(cacheKey);
    if (cached) {
        logger?.cacheHit(cacheKey);
        return cached;
    }
    logger?.cacheMiss(cacheKey);

    const url = `${BASE_URL}/${name}`;
    try {
        logger?.apiRequest('GET', url);
        const t0 = Date.now();
        const resp = await fetchWithRetry(url, undefined, logger);
        logger?.apiResponse(resp.status, resp.statusText, Date.now() - t0);
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
            publisher: null,
        };

        const archiveUrl = latest.archive_url ?? null;
        if (archiveUrl) {
            await cache?.set(`pub.archiveUrl.${name}`, archiveUrl);
        }

        await cache?.set(cacheKey, info);
        return info;
    } catch {
        logger?.error(`Failed to fetch pub.dev info for ${name}`);
        return null;
    }
}

/** Fetch pub.dev score and return granted points. */
export async function fetchPackageScore(
    name: string,
    cache?: CacheService,
    logger?: ScanLogger,
): Promise<number> {
    const cacheKey = `pub.score.${name}`;
    const cached = cache?.get<number>(cacheKey);
    if (cached !== null && cached !== undefined) {
        logger?.cacheHit(cacheKey);
        return cached;
    }
    logger?.cacheMiss(cacheKey);

    const url = `${BASE_URL}/${name}/score`;
    try {
        logger?.apiRequest('GET', url);
        const t0 = Date.now();
        const resp = await fetchWithRetry(url, undefined, logger);
        logger?.apiResponse(resp.status, resp.statusText, Date.now() - t0);
        if (!resp.ok) { return 0; }

        const json: any = await resp.json();
        const points = json.grantedPoints ?? 0;

        await cache?.set(cacheKey, points);
        return points;
    } catch {
        logger?.error(`Failed to fetch pub.dev score for ${name}`);
        return 0;
    }
}

/** Fetch verified publisher ID from pub.dev. */
export async function fetchPublisher(
    name: string,
    cache?: CacheService,
    logger?: ScanLogger,
): Promise<string | null> {
    const cacheKey = `pub.publisher.${name}`;
    const cached = cache?.get<string | null>(cacheKey);
    if (cached !== undefined) {
        logger?.cacheHit(cacheKey);
        return cached;
    }
    logger?.cacheMiss(cacheKey);

    const url = `${BASE_URL}/${name}/publisher`;
    try {
        logger?.apiRequest('GET', url);
        const t0 = Date.now();
        const resp = await fetchWithRetry(url, undefined, logger);
        logger?.apiResponse(resp.status, resp.statusText, Date.now() - t0);
        if (!resp.ok) { return null; }

        const json: any = await resp.json();
        const publisherId = json.publisherId ?? null;

        await cache?.set(cacheKey, publisherId);
        return publisherId;
    } catch {
        logger?.error(`Failed to fetch publisher for ${name}`);
        return null;
    }
}

/** Fetch archive size in bytes via HEAD request to the package archive. */
export async function fetchArchiveSize(
    name: string,
    cache?: CacheService,
    logger?: ScanLogger,
): Promise<number | null> {
    const cacheKey = `pub.archiveSize.${name}`;
    const cached = cache?.get<number>(cacheKey);
    if (cached !== null && cached !== undefined) {
        logger?.cacheHit(cacheKey);
        return cached;
    }
    logger?.cacheMiss(cacheKey);

    const archiveUrl = await resolveArchiveUrl(name, cache, logger);
    if (!archiveUrl) { return null; }

    return headContentLength(archiveUrl, cacheKey, cache, logger);
}

async function resolveArchiveUrl(
    name: string,
    cache?: CacheService,
    logger?: ScanLogger,
): Promise<string | null> {
    const cachedUrl = cache?.get<string>(`pub.archiveUrl.${name}`);
    if (cachedUrl) { return cachedUrl; }

    const url = `${BASE_URL}/${name}`;
    try {
        logger?.apiRequest('GET', url);
        const t0 = Date.now();
        const resp = await fetchWithRetry(url, undefined, logger);
        logger?.apiResponse(resp.status, resp.statusText, Date.now() - t0);
        if (!resp.ok) { return null; }

        const json: any = await resp.json();
        return json.latest?.archive_url ?? null;
    } catch {
        return null;
    }
}

async function headContentLength(
    archiveUrl: string,
    cacheKey: string,
    cache?: CacheService,
    logger?: ScanLogger,
): Promise<number | null> {
    try {
        logger?.apiRequest('HEAD', archiveUrl);
        const t0 = Date.now();
        const resp = await fetchWithRetry(
            archiveUrl, { method: 'HEAD' }, logger,
        );
        logger?.apiResponse(resp.status, resp.statusText, Date.now() - t0);
        if (!resp.ok) { return null; }

        const header = resp.headers.get('Content-Length');
        if (!header) { return null; }

        const size = parseInt(header, 10);
        if (!Number.isFinite(size)) { return null; }

        await cache?.set(cacheKey, size);
        return size;
    } catch {
        return null;
    }
}
