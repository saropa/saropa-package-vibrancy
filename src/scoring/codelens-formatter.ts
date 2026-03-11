import { VibrancyCategory, VibrancyResult } from '../types';
import { categoryLabel } from './status-classifier';
import { formatSizeMB } from './bloat-calculator';

export type CodeLensDetail = 'minimal' | 'standard' | 'full';

export function categoryEmoji(category: VibrancyCategory): string {
    switch (category) {
        case 'vibrant': return '🟢';
        case 'quiet': return '🟡';
        case 'legacy-locked': return '🟠';
        case 'end-of-life': return '🔴';
    }
}

function formatUpdateSegment(result: VibrancyResult): string {
    if (!result.updateInfo
        || result.updateInfo.updateStatus === 'up-to-date') {
        return '✓ Up to date';
    }
    const { currentVersion, latestVersion, updateStatus } = result.updateInfo;
    return `⬆ ${currentVersion} → ${latestVersion} (${updateStatus})`;
}

function formatAlertSegment(result: VibrancyResult): string | null {
    if (result.knownIssue?.replacement) {
        return `⚠ Replace with ${result.knownIssue.replacement}`;
    }
    if (result.knownIssue?.reason) {
        return '⚠ Known issue';
    }
    return null;
}

/** Build the display string for a CodeLens annotation. Pure function. */
export function formatCodeLensTitle(
    result: VibrancyResult,
    detail: CodeLensDetail,
): string {
    const emoji = categoryEmoji(result.category);
    const displayScore = Math.round(result.score / 10);
    const label = categoryLabel(result.category);
    const parts: string[] = [`${emoji} ${displayScore}/10 ${label}`];

    if (detail === 'minimal') { return parts[0]; }

    if (detail === 'full' && result.archiveSizeBytes !== null) {
        parts.push(formatSizeMB(result.archiveSizeBytes));
    }

    parts.push(formatUpdateSegment(result));

    const alert = formatAlertSegment(result);
    if (alert) { parts.push(alert); }

    if (result.isUnused) { parts.push('⚠ Unused'); }

    return parts.join(' · ');
}
