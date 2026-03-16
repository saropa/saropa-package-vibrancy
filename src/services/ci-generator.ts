/**
 * CI workflow generation orchestrator.
 *
 * Delegates to platform-specific template generators in ci-generator-templates.ts.
 * Also provides helper functions for output paths, display names, and
 * the quick-pick list of available CI platforms.
 */

import { CiThresholds, CiPlatform } from '../types';
import {
    generateGitHubActions,
    generateGitLabCi,
    generateShellScript,
} from './ci-generator-templates';

/* Re-export template functions so existing imports from this module keep working. */
export * from './ci-generator-templates';

/** Generate CI workflow content for the specified platform. */
export function generateCiWorkflow(
    platform: CiPlatform,
    thresholds: CiThresholds,
): string {
    switch (platform) {
        case 'github-actions':
            return generateGitHubActions(thresholds);
        case 'gitlab-ci':
            return generateGitLabCi(thresholds);
        case 'shell-script':
            return generateShellScript(thresholds);
    }
}

/** Get the default output path for a CI platform. */
export function getDefaultOutputPath(platform: CiPlatform): string {
    switch (platform) {
        case 'github-actions':
            return '.github/workflows/vibrancy-check.yml';
        case 'gitlab-ci':
            return '.gitlab-ci-vibrancy.yml';
        case 'shell-script':
            return 'scripts/vibrancy-check.sh';
    }
}

/** Get platform display name for UI. */
export function getPlatformDisplayName(platform: CiPlatform): string {
    switch (platform) {
        case 'github-actions':
            return 'GitHub Actions';
        case 'gitlab-ci':
            return 'GitLab CI';
        case 'shell-script':
            return 'Shell Script (portable)';
    }
}

/** Get all available platforms for quick-pick. */
export function getAvailablePlatforms(): { id: CiPlatform; label: string; description: string }[] {
    return [
        {
            id: 'github-actions',
            label: '$(github) GitHub Actions',
            description: '.github/workflows/vibrancy-check.yml',
        },
        {
            id: 'gitlab-ci',
            label: '$(git-merge) GitLab CI',
            description: '.gitlab-ci-vibrancy.yml',
        },
        {
            id: 'shell-script',
            label: '$(terminal) Shell Script',
            description: 'scripts/vibrancy-check.sh (portable)',
        },
    ];
}
