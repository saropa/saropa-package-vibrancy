import * as assert from 'assert';
import { formatAnnotation, buildAnnotationEdits } from '../../providers/annotate-command';

/** Create a minimal fake TextDocument from raw text. */
function makeFakeDoc(text: string): any {
    const lines = text.split('\n');
    return {
        lineCount: lines.length,
        lineAt: (i: number) => ({ text: lines[i] ?? '' }),
    };
}

describe('annotate-command', () => {
    describe('formatAnnotation', () => {
        it('should format description and URL', () => {
            const result = formatAnnotation('http', 'An HTTP client library.');
            assert.strictEqual(
                result,
                '  # An HTTP client library.\n  # https://pub.dev/packages/http\n',
            );
        });

        it('should return URL only when description is null', () => {
            const result = formatAnnotation('http', null);
            assert.strictEqual(
                result,
                '  # https://pub.dev/packages/http\n',
            );
        });

        it('should truncate long descriptions at 80 chars', () => {
            const longDesc = 'A'.repeat(100);
            const result = formatAnnotation('pkg', longDesc);
            const lines = result.split('\n');
            const descLine = lines[0];
            // "  # " = 4 chars prefix + 77 content chars + "..." = 84 total
            assert.ok(descLine.length <= 84);
            assert.ok(descLine.endsWith('...'));
        });

        it('should not truncate descriptions at exactly 80 chars', () => {
            const exactDesc = 'B'.repeat(80);
            const result = formatAnnotation('pkg', exactDesc);
            assert.ok(!result.includes('...'));
        });
    });

    describe('buildAnnotationEdits', () => {
        it('should insert annotations above each package', () => {
            const doc = makeFakeDoc(
                'dependencies:\n  http: ^1.6.0\n  provider: ^6.1.1',
            );
            const descriptions = new Map([
                ['http', 'HTTP client'],
                ['provider', 'State management'],
            ]);

            const edits = buildAnnotationEdits(
                doc, ['http', 'provider'], descriptions,
            );

            assert.strictEqual(edits.length, 2);
            assert.ok(edits[0].text.includes('HTTP client'));
            assert.ok(edits[0].text.includes('pub.dev/packages/http'));
            assert.ok(edits[1].text.includes('State management'));
        });

        it('should skip packages not found in document', () => {
            const doc = makeFakeDoc('dependencies:\n  http: ^1.6.0');
            const descriptions = new Map([['missing', 'Gone']]);

            const edits = buildAnnotationEdits(
                doc, ['missing'], descriptions,
            );

            assert.strictEqual(edits.length, 0);
        });

        it('should handle missing descriptions gracefully', () => {
            const doc = makeFakeDoc('dependencies:\n  http: ^1.6.0');
            const descriptions = new Map<string, string>();

            const edits = buildAnnotationEdits(
                doc, ['http'], descriptions,
            );

            assert.strictEqual(edits.length, 1);
            assert.ok(edits[0].text.includes('pub.dev/packages/http'));
            assert.ok(!edits[0].text.includes('# \n'));
        });

        it('should replace existing annotations', () => {
            const doc = makeFakeDoc(
                'dependencies:\n'
                + '  # Old description\n'
                + '  # https://pub.dev/packages/http\n'
                + '  http: ^1.6.0',
            );
            const descriptions = new Map([['http', 'New description']]);

            const edits = buildAnnotationEdits(
                doc, ['http'], descriptions,
            );

            assert.strictEqual(edits.length, 1);
            assert.ok(edits[0].deleteRange);
            assert.ok(edits[0].text.includes('New description'));
        });

        it('should replace URL-only existing annotations', () => {
            const doc = makeFakeDoc(
                'dependencies:\n'
                + '  # https://pub.dev/packages/http\n'
                + '  http: ^1.6.0',
            );
            const descriptions = new Map([['http', 'Added description']]);

            const edits = buildAnnotationEdits(
                doc, ['http'], descriptions,
            );

            assert.strictEqual(edits.length, 1);
            assert.ok(edits[0].deleteRange);
            assert.ok(edits[0].text.includes('Added description'));
        });

        it('should handle package on first line of document', () => {
            const doc = makeFakeDoc('  http: ^1.6.0');
            const descriptions = new Map([['http', 'HTTP client']]);

            const edits = buildAnnotationEdits(
                doc, ['http'], descriptions,
            );

            assert.strictEqual(edits.length, 1);
            assert.ok(!edits[0].deleteRange);
        });

        it('should handle empty string description as missing', () => {
            const result = formatAnnotation('http', '');
            assert.strictEqual(
                result,
                '  # https://pub.dev/packages/http\n',
            );
        });

        it('should not treat user comments as annotations', () => {
            const doc = makeFakeDoc(
                'dependencies:\n'
                + '  # TODO: migrate this\n'
                + '  http: ^1.6.0',
            );
            const descriptions = new Map([['http', 'HTTP client']]);

            const edits = buildAnnotationEdits(
                doc, ['http'], descriptions,
            );

            assert.strictEqual(edits.length, 1);
            assert.ok(!edits[0].deleteRange);
        });
    });
});
