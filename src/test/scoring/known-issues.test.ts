import * as assert from 'assert';
import { findKnownIssue, allKnownIssues } from '../../scoring/known-issues';

describe('known-issues', () => {
    it('should find a known bad package', () => {
        const issue = findKnownIssue('flutter_datetime_picker');
        assert.ok(issue);
        assert.strictEqual(issue.status, 'end_of_life');
        assert.ok(issue.reason.length > 0);
    });

    it('should return null for unknown packages', () => {
        assert.strictEqual(findKnownIssue('totally_made_up_pkg'), null);
    });

    it('should load all 100 known issues', () => {
        const all = allKnownIssues();
        assert.strictEqual(all.size, 100);
    });

    it('should have required fields on every entry', () => {
        for (const [name, issue] of allKnownIssues()) {
            assert.ok(name.length > 0, `empty name`);
            assert.ok(issue.status.length > 0, `${name}: missing status`);
            assert.ok(issue.reason.length > 0, `${name}: missing reason`);
            assert.ok(issue.as_of.length > 0, `${name}: missing as_of`);
        }
    });
});
