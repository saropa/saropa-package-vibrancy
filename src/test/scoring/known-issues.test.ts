import * as assert from 'assert';
import knownIssuesData from '../../data/knownIssues.json';
import { findKnownIssue, allKnownIssues } from '../../scoring/known-issues';

describe('known-issues', () => {
    it('should have unique names', () => {
        const names = (knownIssuesData as Array<{ name: string }>).map(
            (e) => e.name,
        );
        const dupes = names.filter(
            (n, i) => names.indexOf(n) !== i,
        );
        assert.deepStrictEqual(
            dupes,
            [],
            `duplicate names in knownIssues.json: ${dupes.join(', ')}`,
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
});
