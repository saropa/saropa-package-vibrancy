import * as assert from 'assert';
import knownIssuesData from '../../data/known_issues.json';
import { findKnownIssue, allKnownIssues, isReplacementPackageName } from '../../scoring/known-issues';

describe('known-issues', () => {
    it('should have unique names', () => {
        const names = (knownIssuesData as { issues: Array<{ name: string }> }).issues.map(
            (e) => e.name,
        );
        const dupes = names.filter(
            (n, i) => names.indexOf(n) !== i,
        );
        assert.deepStrictEqual(
            dupes,
            [],
            `duplicate names in known_issues.json: ${dupes.join(', ')}`,
        );
    });

    it('should find a known bad package', () => {
        const issue = findKnownIssue('flutter_datetime_picker');
        assert.ok(issue);
        assert.strictEqual(issue.status, 'end_of_life');
        assert.ok(issue.reason && issue.reason.length > 0);
    });

    it('should return null for unknown packages', () => {
        assert.strictEqual(findKnownIssue('totally_made_up_pkg'), null);
    });

    it('should load all known issues', () => {
        const all = allKnownIssues();
        assert.ok(all.size >= 400, `expected at least 400, got ${all.size}`);
    });

    it('should have required fields on every entry', () => {
        for (const [name, issue] of allKnownIssues()) {
            assert.ok(name.length > 0, `empty name`);
            assert.ok(issue.status.length > 0, `${name}: missing status`);
        }
    });

    it('should find an active status package', () => {
        const issue = findKnownIssue('http');
        assert.ok(issue);
        assert.strictEqual(issue.status, 'active');
    });

    it('should normalize N/A replacement to undefined', () => {
        const issue = findKnownIssue('http');
        assert.ok(issue);
        assert.strictEqual(issue.replacement, undefined);
        assert.strictEqual(issue.migrationNotes, undefined);
    });

    it('should preserve archiveSizeBytes when present', () => {
        const issue = findKnownIssue('flutter_datetime_picker');
        assert.ok(issue);
        assert.strictEqual(issue.archiveSizeBytes, 317440);
    });

    it('should leave archiveSizeBytes undefined when null in JSON', () => {
        const all = allKnownIssues();
        let foundUndefined = false;
        for (const [, issue] of all) {
            if (issue.archiveSizeBytes === undefined) {
                foundUndefined = true;
                break;
            }
        }
        assert.ok(foundUndefined, 'expected at least one entry with undefined archiveSizeBytes');
    });

    it('should parse license field when present', () => {
        const issue = findKnownIssue('flutter_datetime_picker');
        assert.ok(issue);
        assert.strictEqual(issue.license, 'MIT');
    });

    it('should parse platforms array when present', () => {
        const issue = findKnownIssue('flutter_datetime_picker');
        assert.ok(issue);
        assert.ok(Array.isArray(issue.platforms));
    });

    it('should parse pubPoints when present', () => {
        const issue = findKnownIssue('flutter_datetime_picker');
        assert.ok(issue);
        assert.strictEqual(typeof issue.pubPoints, 'number');
    });

    it('should parse verifiedPublisher when present', () => {
        const issue = findKnownIssue('flutter_datetime_picker');
        assert.ok(issue);
        assert.strictEqual(typeof issue.verifiedPublisher, 'boolean');
    });

    it('should have migrationNotes when replacement is present', () => {
        for (const [name, issue] of allKnownIssues()) {
            if (issue.replacement) {
                assert.ok(
                    issue.migrationNotes,
                    `${name}: has replacement but missing migrationNotes`,
                );
            }
        }
    });

    describe('isReplacementPackageName', () => {
        it('should return true for pub package names', () => {
            assert.strictEqual(isReplacementPackageName('dio'), true);
            assert.strictEqual(isReplacementPackageName('path_provider'), true);
            assert.strictEqual(isReplacementPackageName('flutter_secure_storage'), true);
        });

        it('should return false for upgrade instructions and freeform text', () => {
            assert.strictEqual(isReplacementPackageName('Update to v9+'), false);
            assert.strictEqual(isReplacementPackageName('Update to latest version'), false);
            assert.strictEqual(isReplacementPackageName('Use Native Channels'), false);
            assert.strictEqual(isReplacementPackageName('Native `showDialog`'), false);
        });
    });
});
