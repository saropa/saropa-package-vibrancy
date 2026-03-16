import * as vscode from 'vscode';

/**
 * DEPRECATED: Saropa Package Vibrancy has been merged into the Saropa Lints
 * extension. This standalone extension is no longer maintained.
 *
 * All functionality is now available as collapsible panels in the Saropa Lints
 * sidebar under "Package Vibrancy", "Package Problems", and "Package Details".
 */
export function activate(_context: vscode.ExtensionContext): void {
    const LINTS_EXTENSION_ID = 'saropa.saropa-lints';
    const hasLintsExtension = vscode.extensions.getExtension(LINTS_EXTENSION_ID) !== undefined;

    const message = hasLintsExtension
        ? 'Saropa Package Vibrancy has been merged into Saropa Lints, which is already installed. '
          + 'You can safely uninstall this extension — all vibrancy features are in the Saropa Lints sidebar.'
        : 'Saropa Package Vibrancy has been merged into Saropa Lints. '
          + 'Please install "Saropa Lints" and uninstall this extension.';

    const actions = hasLintsExtension ? ['Uninstall This Extension'] : ['Install Saropa Lints'];

    void vscode.window.showWarningMessage(message, ...actions).then((choice) => {
        if (choice === 'Install Saropa Lints') {
            void vscode.commands.executeCommand(
                'workbench.extensions.installExtension',
                LINTS_EXTENSION_ID,
            );
        } else if (choice === 'Uninstall This Extension') {
            void vscode.commands.executeCommand(
                'workbench.extensions.uninstallExtension',
                'saropa.saropa-package-vibrancy',
            );
        }
    });
}

export function deactivate(): void {}
