import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import {
    fetchPackageInfo, fetchPackageScore, fetchPublisher,
} from '../../services/pub-dev-api';

const fixturesDir = path.join(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');

describe('pub-dev-api', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        fetchStub = sinon.stub(globalThis, 'fetch');
    });

    afterEach(() => {
        fetchStub.restore();
    });

    describe('fetchPackageInfo', () => {
        it('should parse a valid response', async () => {
            const fixture = fs.readFileSync(
                path.join(fixturesDir, 'pub-dev-response.json'), 'utf8',
            );
            fetchStub.resolves(new Response(fixture, { status: 200 }));

            const info = await fetchPackageInfo('http');
            assert.ok(info);
            assert.strictEqual(info.name, 'http');
            assert.strictEqual(info.latestVersion, '1.2.0');
            assert.strictEqual(info.repositoryUrl, 'https://github.com/dart-lang/http');
            assert.strictEqual(info.isDiscontinued, false);
        });

        it('should return null for 404', async () => {
            fetchStub.resolves(new Response('', { status: 404 }));
            const info = await fetchPackageInfo('nonexistent');
            assert.strictEqual(info, null);
        });

        it('should call the correct URL', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            await fetchPackageInfo('provider');
            assert.ok(fetchStub.calledOnce);
            assert.ok(
                fetchStub.firstCall.args[0].includes('/packages/provider'),
            );
        });
    });

    describe('fetchPublisher', () => {
        it('should return publisher ID', async () => {
            const body = JSON.stringify({ publisherId: 'dart.dev' });
            fetchStub.resolves(new Response(body, { status: 200 }));

            const pub = await fetchPublisher('path');
            assert.strictEqual(pub, 'dart.dev');
        });

        it('should return null for 404', async () => {
            fetchStub.resolves(new Response('', { status: 404 }));
            const pub = await fetchPublisher('no_publisher_pkg');
            assert.strictEqual(pub, null);
        });

        it('should return null when publisherId is missing', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            const pub = await fetchPublisher('empty_response');
            assert.strictEqual(pub, null);
        });

        it('should call the correct URL', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            await fetchPublisher('path');
            assert.ok(fetchStub.calledOnce);
            assert.ok(
                fetchStub.firstCall.args[0].includes('/packages/path/publisher'),
            );
        });
    });

    describe('fetchPackageScore', () => {
        it('should return granted points', async () => {
            const fixture = fs.readFileSync(
                path.join(fixturesDir, 'pub-dev-score.json'), 'utf8',
            );
            fetchStub.resolves(new Response(fixture, { status: 200 }));

            const points = await fetchPackageScore('http');
            assert.strictEqual(points, 140);
        });

        it('should return 0 for failed requests', async () => {
            fetchStub.resolves(new Response('', { status: 400 }));
            const points = await fetchPackageScore('broken');
            assert.strictEqual(points, 0);
        });
    });
});
