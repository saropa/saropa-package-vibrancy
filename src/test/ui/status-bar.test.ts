import * as assert from 'assert';
import { VibrancyStatusBar } from '../../ui/status-bar';
import { VibrancyResult } from '../../types';

function makeResult(name: string, score: number): VibrancyResult {
    return {
        package: { name, version: '1.0.0', constraint: '^1.0.0', source: 'hosted', isDirect: true },
        pubDev: null,
        github: null,
        knownIssue: null,
        score,
        category: score >= 70 ? 'vibrant' : score >= 40 ? 'quiet' : 'legacy-locked',
        resolutionVelocity: 0,
        engagementLevel: 0,
        popularity: 0,
        publisherTrust: 0,
        updateInfo: null,
        archiveSizeBytes: null,
        bloatRating: null,
        license: null,
        drift: null,
        isUnused: false,
    };
}

describe('VibrancyStatusBar', () => {
    let statusBar: VibrancyStatusBar;

    beforeEach(() => {
        statusBar = new VibrancyStatusBar();
    });

    afterEach(() => {
        statusBar.dispose();
    });

    it('should be constructable', () => {
        assert.ok(statusBar);
    });

    it('should update with results', () => {
        statusBar.update([makeResult('http', 80), makeResult('bloc', 60)]);
    });

    it('should handle empty results', () => {
        statusBar.update([]);
    });

    it('should be disposable', () => {
        statusBar.dispose();
    });
});
