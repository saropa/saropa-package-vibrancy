import { execFile } from 'child_process';

/** Result of a Flutter CLI command execution. */
export interface CommandResult {
    readonly success: boolean;
    readonly output: string;
}

function runFlutterCommand(
    args: string[], cwd: string, timeout: number,
): Promise<CommandResult> {
    return new Promise((resolve) => {
        execFile(
            'flutter', args,
            { encoding: 'utf-8', timeout, cwd },
            (err, stdout, stderr) => {
                resolve({
                    success: !err,
                    output: (stdout || '') + (stderr || ''),
                });
            },
        );
    });
}

/** Run `flutter pub get` in the given directory. */
export function runPubGet(cwd: string): Promise<CommandResult> {
    return runFlutterCommand(['pub', 'get'], cwd, 60_000);
}

/** Run `flutter test` in the given directory. */
export function runFlutterTest(cwd: string): Promise<CommandResult> {
    return runFlutterCommand(['test'], cwd, 300_000);
}
