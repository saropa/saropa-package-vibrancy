import { execSync } from 'child_process';

/** Detect locally installed Dart SDK version. */
export function detectDartVersion(): string {
    try {
        const output = execSync('dart --version', {
            encoding: 'utf-8',
            timeout: 5000,
        });
        const match = output.match(/Dart SDK version:\s*(\S+)/);
        return match?.[1] ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

/** Detect locally installed Flutter SDK version. */
export function detectFlutterVersion(): string {
    try {
        const output = execSync('flutter --version', {
            encoding: 'utf-8',
            timeout: 10000,
        });
        const match = output.match(/Flutter\s+(\S+)/);
        return match?.[1] ?? 'unknown';
    } catch {
        return 'unknown';
    }
}
