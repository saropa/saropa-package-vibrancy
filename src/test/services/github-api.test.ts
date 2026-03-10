import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { extractGitHubRepo, fetchRepoMetrics } from '../../services/github-api';

const fixturesDir = path.join(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');

describe('github-api', () => {
    describe('extractGitHubRepo', () => {
        it('should parse standard GitHub URLs', () => {
            const result = extractGitHubRepo('https://github.com/dart-lang/http');
            assert.deepStrictEqual(result, { owner: 'dart-lang', repo: 'http' });
        });

        it('should parse URLs with trailing paths', () => {
            const result = extractGitHubRepo('https://github.com/org/repo/tree/main');
            assert.deepStrictEqual(result, { owner: 'org', repo: 'repo' });
        });

        it('should return null for non-GitHub URLs', () => {
            assert.strictEqual(extractGitHubRepo('https://gitlab.com/a/b'), null);
        });

        it('should return null for invalid URLs', () => {
            assert.strictEqual(extractGitHubRepo('not-a-url'), null);
        });
    });

    describe('repo URL override priority', () => {
        it('should prefer override URL over pub.dev URL', () => {
            const overrides: Record<string, string> = {
                'my_pkg': 'https://github.com/correct-org/my_pkg',
            };
            const pubDevUrl = 'https://github.com/wrong-org/old_repo';
            const repoUrl = overrides['my_pkg'] ?? pubDevUrl;
            const parsed = extractGitHubRepo(repoUrl);
            assert.deepStrictEqual(parsed, {
                owner: 'correct-org', repo: 'my_pkg',
            });
        });

        it('should fall back to pub.dev URL when no override', () => {
            const overrides: Record<string, string> = {};
            const pubDevUrl = 'https://github.com/dart-lang/http';
            const repoUrl = overrides['http'] ?? pubDevUrl;
            const parsed = extractGitHubRepo(repoUrl);
            assert.deepStrictEqual(parsed, {
                owner: 'dart-lang', repo: 'http',
            });
        });

        it('should handle null pub.dev URL with no override', () => {
            const overrides: Record<string, string> = {};
            const pubDevUrl: string | null = null;
            const repoUrl = overrides['pkg'] ?? pubDevUrl ?? null;
            assert.strictEqual(repoUrl, null);
        });

        it('should use override even when pub.dev URL is null', () => {
            const overrides: Record<string, string> = {
                'orphan_pkg': 'https://github.com/org/orphan_pkg',
            };
            const pubDevUrl: string | null = null;
            const repoUrl = overrides['orphan_pkg'] ?? pubDevUrl ?? null;
            const parsed = extractGitHubRepo(repoUrl!);
            assert.deepStrictEqual(parsed, {
                owner: 'org', repo: 'orphan_pkg',
            });
        });
    });

    describe('fetchRepoMetrics', () => {
        let fetchStub: sinon.SinonStub;

        beforeEach(() => {
            fetchStub = sinon.stub(globalThis, 'fetch');
        });

        afterEach(() => {
            fetchStub.restore();
        });

        it('should parse fixture responses into metrics', async () => {
            const repoData = fs.readFileSync(path.join(fixturesDir, 'github-repo.json'), 'utf8');
            const issuesData = fs.readFileSync(path.join(fixturesDir, 'github-issues.json'), 'utf8');
            const pullsData = fs.readFileSync(path.join(fixturesDir, 'github-pulls.json'), 'utf8');

            fetchStub.onCall(0).resolves(new Response(repoData, { status: 200 }));
            fetchStub.onCall(1).resolves(new Response(issuesData, { status: 200 }));
            fetchStub.onCall(2).resolves(new Response(pullsData, { status: 200 }));

            const metrics = await fetchRepoMetrics('dart-lang', 'http');
            assert.ok(metrics);
            assert.strictEqual(metrics.stars, 890);
            assert.strictEqual(metrics.openIssues, 42);
        });

        it('should return null when repo request fails', async () => {
            fetchStub.resolves(new Response('', { status: 404 }));
            const metrics = await fetchRepoMetrics('no', 'repo');
            assert.strictEqual(metrics, null);
        });

        it('should include auth header when token provided', async () => {
            fetchStub.resolves(new Response('{}', { status: 404 }));
            await fetchRepoMetrics('a', 'b', { token: 'my-token' });
            const headers = fetchStub.firstCall.args[1]?.headers;
            assert.ok(headers?.Authorization?.includes('my-token'));
        });
    });
});
