import * as assert from 'assert';
import * as vscode from 'vscode';
import { VibrancyDiagnostics } from '../../providers/diagnostics';
import { VibrancyResult } from '../../types';
import { MockDiagnosticCollection } from '../vscode-mock';

const PUBSPEC_CONTENT = `dependencies:
  http: ^1.0.0
  flutter_bloc: ^8.0.0
  old_pkg: ^0.1.0
`;

function makeResult(
    name: string,
    score: number,
    category: VibrancyResult['category'],
): VibrancyResult {
    return {
        package: { name, version: '1.0.0', source: 'hosted', isDirect: true },
        pubDev: null,
        github: null,
        knownIssue: null,
        score,
        category,
        resolutionVelocity: 0,
        engagementLevel: 0,
        popularity: 0,
    };
}

describe('VibrancyDiagnostics', () => {
    let collection: MockDiagnosticCollection;
    let diagnostics: VibrancyDiagnostics;
    const uri = vscode.Uri.file('/test/pubspec.yaml');

    beforeEach(() => {
        collection = new MockDiagnosticCollection('test');
        diagnostics = new VibrancyDiagnostics(
            collection as unknown as vscode.DiagnosticCollection,
        );
    });

    it('should create diagnostics for non-vibrant packages', () => {
        const results = [
            makeResult('http', 80, 'vibrant'),
            makeResult('flutter_bloc', 35, 'legacy-locked'),
            makeResult('old_pkg', 5, 'end-of-life'),
        ];
        diagnostics.update(uri, PUBSPEC_CONTENT, results);
        const diags = collection.get(uri);
        assert.ok(diags);
        assert.strictEqual(diags!.length, 2);
    });

    it('should skip vibrant packages', () => {
        const results = [makeResult('http', 85, 'vibrant')];
        diagnostics.update(uri, PUBSPEC_CONTENT, results);
        const diags = collection.get(uri);
        assert.ok(diags);
        assert.strictEqual(diags!.length, 0);
    });

    it('should set Error severity for end-of-life', () => {
        const results = [makeResult('old_pkg', 5, 'end-of-life')];
        diagnostics.update(uri, PUBSPEC_CONTENT, results);
        const diags = collection.get(uri)!;
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
    });

    it('should set Warning severity for legacy-locked', () => {
        const results = [makeResult('flutter_bloc', 30, 'legacy-locked')];
        diagnostics.update(uri, PUBSPEC_CONTENT, results);
        const diags = collection.get(uri)!;
        assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Warning);
    });

    it('should include known issue reason in message', () => {
        const result: VibrancyResult = {
            ...makeResult('old_pkg', 5, 'end-of-life'),
            knownIssue: {
                name: 'old_pkg',
                status: 'discontinued',
                reason: 'No longer maintained',
                as_of: '2024-01-01',
                replacement: 'new_pkg',
            },
        };
        diagnostics.update(uri, PUBSPEC_CONTENT, [result]);
        const diags = collection.get(uri)!;
        assert.ok(diags[0].message.includes('No longer maintained'));
    });

    it('should set source to Saropa Package Vibrancy', () => {
        const results = [makeResult('old_pkg', 5, 'end-of-life')];
        diagnostics.update(uri, PUBSPEC_CONTENT, results);
        const diags = collection.get(uri)!;
        assert.strictEqual(diags[0].source, 'Saropa Package Vibrancy');
    });

    it('should clear diagnostics', () => {
        const results = [makeResult('old_pkg', 5, 'end-of-life')];
        diagnostics.update(uri, PUBSPEC_CONTENT, results);
        diagnostics.clear();
        assert.strictEqual(collection.get(uri), undefined);
    });
});
