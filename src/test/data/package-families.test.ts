import * as assert from 'assert';
import { matchFamily } from '../../data/package-families';

describe('package-families', () => {
    describe('matchFamily', () => {
        it('should match firebase_core to Firebase', () => {
            const result = matchFamily('firebase_core');
            assert.deepStrictEqual(result, { id: 'firebase', label: 'Firebase' });
        });

        it('should match cloud_firestore to Firebase', () => {
            const result = matchFamily('cloud_firestore');
            assert.deepStrictEqual(result, { id: 'firebase', label: 'Firebase' });
        });

        it('should match flutterfire_cli to Firebase', () => {
            const result = matchFamily('flutterfire_cli');
            assert.deepStrictEqual(result, { id: 'firebase', label: 'Firebase' });
        });

        it('should return null for google_fonts (publisher prefix, not a version-coupled family)', () => {
            const result = matchFamily('google_fonts');
            assert.strictEqual(result, null);
        });

        it('should match riverpod to Riverpod', () => {
            const result = matchFamily('riverpod');
            assert.deepStrictEqual(result, { id: 'riverpod', label: 'Riverpod' });
        });

        it('should match flutter_riverpod to Riverpod', () => {
            const result = matchFamily('flutter_riverpod');
            assert.deepStrictEqual(result, { id: 'riverpod', label: 'Riverpod' });
        });

        it('should match hooks_riverpod to Riverpod', () => {
            const result = matchFamily('hooks_riverpod');
            assert.deepStrictEqual(result, { id: 'riverpod', label: 'Riverpod' });
        });

        it('should match bloc to Bloc', () => {
            const result = matchFamily('bloc');
            assert.deepStrictEqual(result, { id: 'bloc', label: 'Bloc' });
        });

        it('should match flutter_bloc to Bloc', () => {
            const result = matchFamily('flutter_bloc');
            assert.deepStrictEqual(result, { id: 'bloc', label: 'Bloc' });
        });

        it('should match freezed to Freezed', () => {
            const result = matchFamily('freezed');
            assert.deepStrictEqual(result, { id: 'freezed', label: 'Freezed' });
        });

        it('should match drift to Drift', () => {
            const result = matchFamily('drift');
            assert.deepStrictEqual(result, { id: 'drift', label: 'Drift' });
        });

        it('should match drift_dev to Drift', () => {
            const result = matchFamily('drift_dev');
            assert.deepStrictEqual(result, { id: 'drift', label: 'Drift' });
        });

        it('should return null for non-family packages', () => {
            assert.strictEqual(matchFamily('http'), null);
            assert.strictEqual(matchFamily('path'), null);
            assert.strictEqual(matchFamily('provider'), null);
        });

        it('should return null for empty string', () => {
            assert.strictEqual(matchFamily(''), null);
        });

        it('should not match partial Riverpod names', () => {
            assert.strictEqual(matchFamily('riverpod_lint'), null);
        });

        it('should not match partial Bloc names', () => {
            assert.strictEqual(matchFamily('bloc_test'), null);
        });
    });
});
