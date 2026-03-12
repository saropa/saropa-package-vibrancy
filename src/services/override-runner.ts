import { PackageDependency, OverrideAnalysis } from '../types';
import { DepGraphPackage } from './dep-graph';
import { parseOverrides } from './override-parser';
import { getOverrideAges } from './override-age';
import { analyzeOverrides } from '../scoring/override-analyzer';
import { ScanLogger } from './scan-logger';

/**
 * Run override analysis for a pubspec.yaml.
 * Extracts override entries, fetches their git ages, and analyzes status.
 */
export async function runOverrideAnalysis(
    yamlContent: string,
    deps: readonly PackageDependency[],
    depGraphPackages: readonly DepGraphPackage[],
    workspaceRoot: string,
    logger: ScanLogger,
): Promise<OverrideAnalysis[]> {
    try {
        const overrideEntries = parseOverrides(yamlContent);
        if (overrideEntries.length === 0) {
            return [];
        }

        const packageNames = overrideEntries.map(e => e.name);
        const ages = await getOverrideAges(packageNames, workspaceRoot);

        return analyzeOverrides(overrideEntries, [...deps], [...depGraphPackages], ages);
    } catch (err) {
        logger.info(`Override analysis failed: ${err}`);
        return [];
    }
}
