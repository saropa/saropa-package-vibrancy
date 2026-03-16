/**
 * Archive size resolution for pub.dev packages.
 *
 * Fetches the compressed archive size (in bytes) for a package's latest
 * version by issuing a HEAD request against the archive URL. The archive
 * URL is resolved from the package API response and cached for reuse.
 */

import { CacheService } from './cache-service';
import { ScanLogger } from './scan-logger';
import { fetchWithRetry } from './fetch-retry';
import {
    RegistryService,
    buildPackageApiUrl,
    buildRegistryHeaders,
} from './registry-service';
import { RegistryOptions, PUB_DEV_URL, hashUrl } from './pub-dev-api';

/**
 * Fetch the archive size (in bytes) for a package's latest version.
 *
 * Resolves the archive URL from the package API (or cache), then issues
 * a HEAD request to read the Content-Length header. Returns null when the
 * archive URL cannot be resolved or the HEAD request fails.
 */
export async function fetchArchiveSize(
    name: string,
    cache?: CacheService,
    logger?: ScanLogger,
    registryOpts?: RegistryOptions,
): Promise<number | null> {
    const registryUrl = registryOpts?.registryUrl ?? PUB_DEV_URL;
    const registryService = registryOpts?.registryService;
    const cachePrefix = registryUrl === PUB_DEV_URL
        ? 'pub'
        : `reg.${hashUrl(registryUrl)}`;

    const cacheKey = `${cachePrefix}.archiveSize.${name}`;
    const cached = cache?.get<number>(cacheKey);
    if (cached !== null && cached !== undefined) {
        logger?.cacheHit(cacheKey);
        return cached;
    }
    logger?.cacheMiss(cacheKey);

    const archiveUrl = await resolveArchiveUrl(name, cache, logger, registryOpts);
    if (!archiveUrl) { return null; }

    // Build auth headers for registries that require them
    const headers = registryService
        ? await buildRegistryHeaders(registryUrl, registryService)
        : {};

    return headContentLength(archiveUrl, cacheKey, cache, logger, headers);
}

/**
 * Resolve the archive download URL for a package.
 *
 * Checks the cache first (the URL is stored during fetchPackageInfo),
 * then falls back to fetching the package API response to extract
 * `latest.archive_url`.
 */
async function resolveArchiveUrl(
    name: string,
    cache?: CacheService,
    logger?: ScanLogger,
    registryOpts?: RegistryOptions,
): Promise<string | null> {
    const registryUrl = registryOpts?.registryUrl ?? PUB_DEV_URL;
    const registryService = registryOpts?.registryService;
    const cachePrefix = registryUrl === PUB_DEV_URL
        ? 'pub'
        : `reg.${hashUrl(registryUrl)}`;

    // The archive URL is cached during fetchPackageInfo — try that first
    const cachedUrl = cache?.get<string>(`${cachePrefix}.archiveUrl.${name}`);
    if (cachedUrl) { return cachedUrl; }

    const url = buildPackageApiUrl(registryUrl, name);
    const headers = registryService
        ? await buildRegistryHeaders(registryUrl, registryService)
        : {};

    try {
        logger?.apiRequest('GET', url);
        const t0 = Date.now();
        const resp = await fetchWithRetry(url, { headers }, logger);
        logger?.apiResponse(resp.status, resp.statusText, Date.now() - t0);
        if (!resp.ok) { return null; }

        const json: any = await resp.json();
        return json.latest?.archive_url ?? null;
    } catch {
        return null;
    }
}

/**
 * Issue a HEAD request and return the Content-Length as a number.
 *
 * Caches the result on success so subsequent calls avoid the network
 * round-trip. Returns null when the header is missing, non-numeric,
 * or the request fails.
 */
async function headContentLength(
    archiveUrl: string,
    cacheKey: string,
    cache?: CacheService,
    logger?: ScanLogger,
    headers?: Record<string, string>,
): Promise<number | null> {
    try {
        logger?.apiRequest('HEAD', archiveUrl);
        const t0 = Date.now();
        const resp = await fetchWithRetry(
            archiveUrl, { method: 'HEAD', headers }, logger,
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
