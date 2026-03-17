import { VibrancyResult, VibrancyCategory } from '../types';
import {
    ScoringWeights, calcFlaggedIssuePenalty, calcQualityPenalty,
} from '../scoring/vibrancy-calculator';
import { categoryLabel } from '../scoring/status-classifier';
import { escapeHtml } from './html-utils';
import { getWeightsStyles } from './weights-styles';
import { getWeightsScript } from './weights-script';

interface PackagePreview {
    readonly name: string;
    readonly rv: number;
    readonly el: number;
    readonly pop: number;
    readonly netBonus: number;
    readonly currentScore: number;
    readonly category: VibrancyCategory;
}

function buildPreviewData(results: readonly VibrancyResult[]): PackagePreview[] {
    return results.map(r => {
        const flaggedPenalty = r.github
            ? calcFlaggedIssuePenalty(r.github.flaggedIssues?.length ?? 0)
            : 0;
        const qualityPenalty = calcQualityPenalty(r.pubDev?.pubPoints ?? 0);
        // Net bonus combines publisher trust and all penalties into a single offset
        const netBonus = r.publisherTrust - flaggedPenalty - qualityPenalty;
        return {
            name: r.package.name,
            rv: r.resolutionVelocity,
            el: r.engagementLevel,
            pop: r.popularity,
            netBonus,
            currentScore: r.score,
            category: r.category,
        };
    });
}

function buildPackageRows(packages: PackagePreview[]): string {
    return packages.map(p => `
        <tr data-name="${escapeHtml(p.name)}"
            data-rv="${p.rv.toFixed(1)}"
            data-el="${p.el.toFixed(1)}"
            data-pop="${p.pop.toFixed(1)}"
            data-netbonus="${p.netBonus.toFixed(1)}"
            data-currentscore="${p.currentScore.toFixed(1)}">
            <td>${escapeHtml(p.name)}</td>
            <td>${p.rv.toFixed(1)}</td>
            <td>${p.el.toFixed(1)}</td>
            <td>${p.pop.toFixed(1)}</td>
            <td class="score-cell">${p.currentScore.toFixed(1)}</td>
            <td><span class="category-badge cat-${p.category}">${categoryLabel(p.category)}</span></td>
        </tr>`).join('\n');
}

/** Build the full HTML for the scoring weights webview panel. */
export function buildWeightsHtml(
    results: readonly VibrancyResult[],
    weights: ScoringWeights,
): string {
    const packages = buildPreviewData(results);

    if (packages.length === 0) {
        return buildEmptyHtml();
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>${getWeightsStyles()}</style>
</head>
<body>
    <h1>Scoring Weights</h1>
    <p class="subtitle">Adjust how resolution velocity, engagement, and popularity contribute to the vibrancy score.</p>

    <div class="controls">
        <div class="slider-row">
            <span class="slider-label">Resolution Velocity</span>
            <input type="range" id="slider-rv" class="slider-input"
                min="0" max="1" step="0.05" value="${weights.resolutionVelocity}">
            <span id="value-rv" class="slider-value">${weights.resolutionVelocity.toFixed(2)}</span>
        </div>
        <div class="slider-row">
            <span class="slider-label">Engagement Level</span>
            <input type="range" id="slider-el" class="slider-input"
                min="0" max="1" step="0.05" value="${weights.engagementLevel}">
            <span id="value-el" class="slider-value">${weights.engagementLevel.toFixed(2)}</span>
        </div>
        <div class="slider-row">
            <span class="slider-label">Popularity</span>
            <input type="range" id="slider-pop" class="slider-input"
                min="0" max="1" step="0.05" value="${weights.popularity}">
            <span id="value-pop" class="slider-value">${weights.popularity.toFixed(2)}</span>
        </div>
        <div class="controls-footer">
            <span id="weight-sum" class="sum-indicator sum-ok">Sum: 1.00</span>
            <button id="btn-reset" class="secondary">Reset Defaults</button>
            <button id="btn-apply">Apply</button>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th data-col="name">Package<span class="sort-arrow"></span></th>
                <th data-col="rv">RV<span class="sort-arrow"></span></th>
                <th data-col="el">EL<span class="sort-arrow"></span></th>
                <th data-col="pop">Pop<span class="sort-arrow"></span></th>
                <th data-col="score">Score<span class="sort-arrow"></span></th>
                <th>Category</th>
            </tr>
        </thead>
        <tbody id="pkg-body">
            ${buildPackageRows(packages)}
        </tbody>
    </table>

    <script>${getWeightsScript()}</script>
</body>
</html>`;
}

function buildEmptyHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>${getWeightsStyles()}</style>
</head>
<body>
    <div class="empty-state">
        <p>No scan results available. Run a scan first.</p>
    </div>
</body>
</html>`;
}
