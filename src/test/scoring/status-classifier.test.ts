import * as assert from 'assert';
import {
    classifyStatus,
    isActivelyMaintained,
    categoryIcon,
    categoryToSeverity,
    categoryLabel,
} from '../../scoring/status-classifier';

describe('status-classifier', () => {
    describe('classifyStatus', () => {
        it('should classify high scores as vibrant', () => {
            const cat = classifyStatus({ score: 75, knownIssue: null, pubDev: null });
            assert.strictEqual(cat, 'vibrant');
        });

        it('should classify 40-69 as quiet', () => {
            const cat = classifyStatus({ score: 50, knownIssue: null, pubDev: null });
            assert.strictEqual(cat, 'quiet');
        });

        it('should classify 10-39 as legacy-locked', () => {
            const cat = classifyStatus({ score: 25, knownIssue: null, pubDev: null });
            assert.strictEqual(cat, 'legacy-locked');
        });

        it('should classify <10 as end-of-life', () => {
            const cat = classifyStatus({ score: 5, knownIssue: null, pubDev: null });
            assert.strictEqual(cat, 'end-of-life');
        });

        it('should override with known issue', () => {
            const cat = classifyStatus({
                score: 90,
                knownIssue: {
                    name: 'pkg', status: 'end_of_life',
                    reason: 'bad', as_of: '2024-01-01',
                    replacement: undefined, migrationNotes: undefined,
                },
                pubDev: null,
            });
            assert.strictEqual(cat, 'end-of-life');
        });

        it('should override when discontinued', () => {
            const cat = classifyStatus({
                score: 90,
                knownIssue: null,
                pubDev: {
                    name: 'pkg', latestVersion: '1.0.0', publishedDate: '',
                    repositoryUrl: null, isDiscontinued: true, isUnlisted: false,
                    pubPoints: 100,
                    publisher: null,
                    license: null,
                    description: null,
                    topics: [],
                },
            });
            assert.strictEqual(cat, 'end-of-life');
        });

        // --- Guardrail tests: known issue EOL + live pub.dev data ---

        it('should cap at legacy-locked when known issue says EOL but pubDev shows active maintenance', () => {
            const cat = classifyStatus({
                score: 90,
                knownIssue: {
                    name: 'dio', status: 'end_of_life',
                    reason: 'connection pool bug', as_of: '2024-01-01',
                    replacement: undefined, migrationNotes: undefined,
                },
                pubDev: {
                    name: 'dio', latestVersion: '5.4.0',
                    publishedDate: new Date().toISOString(),
                    repositoryUrl: null, isDiscontinued: false, isUnlisted: false,
                    pubPoints: 160, publisher: 'dart.dev',
                    license: 'MIT', description: null, topics: [],
                },
            });
            assert.strictEqual(cat, 'legacy-locked');
        });

        it('should still return end-of-life when known issue says EOL and pubDev is null', () => {
            const cat = classifyStatus({
                score: 90,
                knownIssue: {
                    name: 'pkg', status: 'end_of_life',
                    reason: 'dead', as_of: '2024-01-01',
                    replacement: undefined, migrationNotes: undefined,
                },
                pubDev: null,
            });
            assert.strictEqual(cat, 'end-of-life');
        });

        it('should still return end-of-life when known issue says EOL and pubDev shows low points', () => {
            const cat = classifyStatus({
                score: 90,
                knownIssue: {
                    name: 'pkg', status: 'end_of_life',
                    reason: 'dead', as_of: '2024-01-01',
                    replacement: undefined, migrationNotes: undefined,
                },
                pubDev: {
                    name: 'pkg', latestVersion: '1.0.0',
                    publishedDate: new Date().toISOString(),
                    repositoryUrl: null, isDiscontinued: false, isUnlisted: false,
                    pubPoints: 50, publisher: null,
                    license: null, description: null, topics: [],
                },
            });
            assert.strictEqual(cat, 'end-of-life');
        });

        it('should still return end-of-life when known issue says EOL and pubDev shows old publish date', () => {
            const cat = classifyStatus({
                score: 90,
                knownIssue: {
                    name: 'pkg', status: 'end_of_life',
                    reason: 'dead', as_of: '2024-01-01',
                    replacement: undefined, migrationNotes: undefined,
                },
                pubDev: {
                    name: 'pkg', latestVersion: '1.0.0',
                    publishedDate: '2022-01-01T00:00:00.000Z',
                    repositoryUrl: null, isDiscontinued: false, isUnlisted: false,
                    pubPoints: 160, publisher: 'dart.dev',
                    license: null, description: null, topics: [],
                },
            });
            assert.strictEqual(cat, 'end-of-life');
        });

        it('should return end-of-life when pubDev isDiscontinued even with high points', () => {
            const cat = classifyStatus({
                score: 90,
                knownIssue: null,
                pubDev: {
                    name: 'pkg', latestVersion: '1.0.0',
                    publishedDate: new Date().toISOString(),
                    repositoryUrl: null, isDiscontinued: true, isUnlisted: false,
                    pubPoints: 160, publisher: 'dart.dev',
                    license: null, description: null, topics: [],
                },
            });
            assert.strictEqual(cat, 'end-of-life');
        });

        it('should prioritize isDiscontinued over known issue guardrail', () => {
            const cat = classifyStatus({
                score: 90,
                knownIssue: {
                    name: 'pkg', status: 'end_of_life',
                    reason: 'dead', as_of: '2024-01-01',
                    replacement: undefined, migrationNotes: undefined,
                },
                pubDev: {
                    name: 'pkg', latestVersion: '1.0.0',
                    publishedDate: new Date().toISOString(),
                    repositoryUrl: null, isDiscontinued: true, isUnlisted: false,
                    pubPoints: 160, publisher: 'dart.dev',
                    license: null, description: null, topics: [],
                },
            });
            assert.strictEqual(cat, 'end-of-life');
        });

        // --- Boundary test for 18-month threshold ---

        it('should cap at legacy-locked when package published exactly 17 months ago', () => {
            const now = Date.now();
            const seventeenMonthsAgo = now - (17 * 30 * 24 * 60 * 60 * 1000);
            const cat = classifyStatus({
                score: 90,
                knownIssue: {
                    name: 'pkg', status: 'end_of_life',
                    reason: 'bug', as_of: '2024-01-01',
                    replacement: undefined, migrationNotes: undefined,
                },
                pubDev: {
                    name: 'pkg', latestVersion: '1.0.0',
                    publishedDate: new Date(seventeenMonthsAgo).toISOString(),
                    repositoryUrl: null, isDiscontinued: false, isUnlisted: false,
                    pubPoints: 150, publisher: 'dart.dev',
                    license: null, description: null, topics: [],
                },
            });
            assert.strictEqual(cat, 'legacy-locked');
        });

        it('should return end-of-life when package published 19 months ago', () => {
            const now = Date.now();
            const nineteenMonthsAgo = now - (19 * 30 * 24 * 60 * 60 * 1000);
            const cat = classifyStatus({
                score: 90,
                knownIssue: {
                    name: 'pkg', status: 'end_of_life',
                    reason: 'bug', as_of: '2024-01-01',
                    replacement: undefined, migrationNotes: undefined,
                },
                pubDev: {
                    name: 'pkg', latestVersion: '1.0.0',
                    publishedDate: new Date(nineteenMonthsAgo).toISOString(),
                    repositoryUrl: null, isDiscontinued: false, isUnlisted: false,
                    pubPoints: 150, publisher: 'dart.dev',
                    license: null, description: null, topics: [],
                },
            });
            assert.strictEqual(cat, 'end-of-life');
        });

        it('should handle boundary at 70', () => {
            assert.strictEqual(
                classifyStatus({ score: 70, knownIssue: null, pubDev: null }),
                'vibrant',
            );
            assert.strictEqual(
                classifyStatus({ score: 69.9, knownIssue: null, pubDev: null }),
                'quiet',
            );
        });
    });

    describe('categoryIcon', () => {
        it('should map categories to icon ids', () => {
            assert.strictEqual(categoryIcon('vibrant'), 'pass');
            assert.strictEqual(categoryIcon('end-of-life'), 'error');
        });
    });

    describe('categoryToSeverity', () => {
        it('should map end-of-life to Warning (1)', () => {
            assert.strictEqual(categoryToSeverity('end-of-life'), 1);
        });

        it('should map vibrant to Hint (3)', () => {
            assert.strictEqual(categoryToSeverity('vibrant'), 3);
        });
    });

    describe('categoryLabel', () => {
        it('should return human-readable labels', () => {
            assert.strictEqual(categoryLabel('legacy-locked'), 'Legacy-Locked');
        });
    });

    describe('isActivelyMaintained', () => {
        const now = Date.parse('2026-03-16T00:00:00.000Z');

        const makePubDev = (overrides: Partial<{
            publishedDate: string; pubPoints: number;
            isDiscontinued: boolean;
        }>) => ({
            name: 'pkg', latestVersion: '1.0.0',
            publishedDate: '2026-01-01T00:00:00.000Z',
            repositoryUrl: null, isDiscontinued: false, isUnlisted: false,
            pubPoints: 160, publisher: 'dart.dev',
            license: null, description: null, topics: [] as readonly string[],
            ...overrides,
        });

        it('should return false for null pubDev', () => {
            assert.strictEqual(isActivelyMaintained(null, now), false);
        });

        it('should return false for discontinued package', () => {
            assert.strictEqual(
                isActivelyMaintained(makePubDev({ isDiscontinued: true }), now),
                false,
            );
        });

        it('should return false for low pub points', () => {
            assert.strictEqual(
                isActivelyMaintained(makePubDev({ pubPoints: 50 }), now),
                false,
            );
        });

        it('should return false for unparseable date', () => {
            assert.strictEqual(
                isActivelyMaintained(makePubDev({ publishedDate: 'invalid' }), now),
                false,
            );
        });

        it('should return true at points boundary (130)', () => {
            assert.strictEqual(
                isActivelyMaintained(makePubDev({ pubPoints: 130 }), now),
                true,
            );
        });

        it('should return false just below points boundary (129)', () => {
            assert.strictEqual(
                isActivelyMaintained(makePubDev({ pubPoints: 129 }), now),
                false,
            );
        });

        it('should return true for package published exactly 18 months ago', () => {
            // 18 months × 30 days = 540 days before "now"
            const eighteenMonthsAgo = now - (18 * 30 * 24 * 60 * 60 * 1000);
            assert.strictEqual(
                isActivelyMaintained(
                    makePubDev({ publishedDate: new Date(eighteenMonthsAgo).toISOString() }),
                    now,
                ),
                true,
            );
        });

        it('should return false for package published 18 months + 1 day ago', () => {
            // 18 months + 1 day past the threshold
            const justOverThreshold = now - ((18 * 30 + 1) * 24 * 60 * 60 * 1000);
            assert.strictEqual(
                isActivelyMaintained(
                    makePubDev({ publishedDate: new Date(justOverThreshold).toISOString() }),
                    now,
                ),
                false,
            );
        });
    });
});
