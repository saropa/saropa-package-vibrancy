const MARKETPLACE_URL =
    'https://marketplace.visualstudio.com/items?itemName=saropa.saropa-package-vibrancy';
const GITHUB_URL =
    'https://github.com/saropa/saropa-package-vibrancy';

/** Build the full HTML for the About panel. */
export function buildAboutHtml(version: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline';">
    <style>${getAboutStyles()}</style>
</head>
<body>
    <h1>Saropa Package Vibrancy</h1>
    <p class="version">v${version}</p>
    <p class="tagline">Analyze Flutter/Dart dependency health and community vibrancy.</p>
    <ul class="links">
        <li><a href="${MARKETPLACE_URL}">VS Code Marketplace</a></li>
        <li><a href="${GITHUB_URL}">GitHub Repository</a></li>
    </ul>
</body>
</html>`;
}

function getAboutStyles(): string {
    return `
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 24px;
            margin: 0;
        }
        h1 { font-size: 1.4em; margin-bottom: 4px; }
        .version {
            font-size: 1.1em; opacity: 0.7; margin: 0 0 12px;
        }
        .tagline { margin: 0 0 20px; }
        .links {
            list-style: none; padding: 0; margin: 0;
        }
        .links li { margin-bottom: 8px; }
        .links a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .links a:hover { text-decoration: underline; }
    `;
}
