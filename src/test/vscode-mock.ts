/**
 * Mock implementation of the vscode API for unit testing outside VS Code.
 * Trimmed subset from saropa_drift_viewer, covering the APIs this extension uses.
 */

export class EventEmitter {
    private _listeners: Array<(...args: any[]) => void> = [];
    event = (listener: (...args: any[]) => void) => {
        this._listeners.push(listener);
        return { dispose: () => { /* no-op */ } };
    };
    fire(...args: any[]) {
        this._listeners.forEach((l) => l(...args));
    }
    dispose() {
        this._listeners.length = 0;
    }
}

export class MockOutputChannel {
    readonly lines: string[] = [];
    constructor(public readonly name: string = 'test') {}
    appendLine(line: string): void { this.lines.push(line); }
    append(): void { /* no-op */ } clear(): void { /* no-op */ }
    show(): void { /* no-op */ } hide(): void { /* no-op */ }
    replace(): void { /* no-op */ } dispose(): void { /* no-op */ }
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

export class ThemeIcon {
    constructor(
        public readonly id: string,
        public readonly color?: ThemeColor,
    ) {}
}

export class ThemeColor {
    constructor(public readonly id: string) {}
}

export class MarkdownString {
    value: string;
    isTrusted?: boolean;
    constructor(value = '') {
        this.value = value;
    }
    appendMarkdown(value: string): this {
        this.value += value;
        return this;
    }
    appendText(value: string): this {
        this.value += value;
        return this;
    }
}

export class Hover {
    contents: MarkdownString | MarkdownString[];
    range?: Range;
    constructor(contents: MarkdownString | MarkdownString[], range?: Range) {
        this.contents = contents;
        this.range = range;
    }
}

export class Position {
    constructor(
        public readonly line: number,
        public readonly character: number,
    ) {}
}

export class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(
        startLine: number,
        startCharacter: number,
        endLine: number,
        endCharacter: number,
    ) {
        this.start = new Position(startLine, startCharacter);
        this.end = new Position(endLine, endCharacter);
    }
}

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export class Diagnostic {
    range: Range;
    message: string;
    severity: DiagnosticSeverity;
    source?: string;
    code?: string | number;

    constructor(
        range: Range,
        message: string,
        severity: DiagnosticSeverity = DiagnosticSeverity.Error,
    ) {
        this.range = range;
        this.message = message;
        this.severity = severity;
    }
}

export class MockDiagnosticCollection {
    readonly name: string;
    private _entries = new Map<string, Diagnostic[]>();

    constructor(name: string) { this.name = name; }

    set(uri: any, diagnostics: Diagnostic[]): void {
        this._entries.set(uri.toString(), diagnostics);
    }

    clear(): void { this._entries.clear(); }

    get(uri: any): Diagnostic[] | undefined {
        return this._entries.get(uri.toString());
    }

    entries(): Map<string, Diagnostic[]> {
        return new Map(this._entries);
    }

    dispose(): void { this._entries.clear(); }
}

export const CodeActionKind = {
    QuickFix: 'quickfix' as const,
};

export class CodeAction {
    title: string;
    kind?: string;
    diagnostics?: Diagnostic[];
    edit?: any;

    constructor(title: string, kind?: string) {
        this.title = title;
        this.kind = kind;
    }
}

export class TreeItem {
    label?: string;
    description?: string;
    tooltip?: string | MarkdownString;
    iconPath?: ThemeIcon | { light: string; dark: string };
    collapsibleState?: TreeItemCollapsibleState;
    contextValue?: string;
    command?: any;

    constructor(
        label: string,
        collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
    ) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

export class MockWebviewPanel {
    webview = { html: '', postMessage: async () => true };
    private _onDidDispose = new EventEmitter();
    revealed = false;

    onDidDispose(listener: () => void) {
        return this._onDidDispose.event(listener);
    }

    reveal() { this.revealed = true; }
    dispose() { this._onDidDispose.fire(); }
}

// --- Mock Memento ---

export class MockMemento {
    private _data = new Map<string, unknown>();

    get<T>(key: string, defaultValue?: T): T | undefined {
        return this._data.has(key)
            ? (this._data.get(key) as T)
            : defaultValue;
    }

    async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this._data.delete(key);
        } else {
            this._data.set(key, value);
        }
    }

    keys(): readonly string[] {
        return [...this._data.keys()];
    }
}

// --- Tracking arrays for test assertions ---

export const createdPanels: MockWebviewPanel[] = [];
export const createdTreeViews: any[] = [];
export const createdDiagnosticCollections: MockDiagnosticCollection[] = [];
export const messageMock = {
    infos: [] as string[],
    errors: [] as string[],
    warnings: [] as string[],
    reset() {
        this.infos.length = 0;
        this.errors.length = 0;
        this.warnings.length = 0;
    },
};

// --- Namespace mocks ---

const registeredCommands: Record<string, (...args: any[]) => any> = {};

export const window = {
    createWebviewPanel: (
        _viewType: string,
        _title: string,
        _column: any,
        _options?: any,
    ): MockWebviewPanel => {
        const panel = new MockWebviewPanel();
        createdPanels.push(panel);
        return panel;
    },
    createTreeView: (_viewId: string, _options: any) => {
        const tv = { dispose: () => { /* no-op */ } };
        createdTreeViews.push(tv);
        return tv;
    },
    createOutputChannel: (name: string) => new MockOutputChannel(name),
    createStatusBarItem: (_id?: any, _alignment?: any, _priority?: number) => ({
        text: '',
        name: '',
        command: '',
        tooltip: '',
        show: () => { /* no-op */ },
        hide: () => { /* no-op */ },
        dispose: () => { /* no-op */ },
    }),
    withProgress: async (_options: any, task: (progress: any) => Promise<any>) =>
        task({ report: () => { /* no-op */ } }),
    showInformationMessage: async (msg: string) => {
        messageMock.infos.push(msg);
    },
    showWarningMessage: async (msg: string) => {
        messageMock.warnings.push(msg);
    },
    showErrorMessage: async (msg: string) => {
        messageMock.errors.push(msg);
    },
    showTextDocument: async (_doc: any, _options?: any) => ({}),
};

export const commands = {
    registerCommand: (id: string, handler: (...args: any[]) => any) => {
        registeredCommands[id] = handler;
        return { dispose: () => { delete registeredCommands[id]; } };
    },
    executeCommand: async (id: string, ...args: any[]) => {
        return registeredCommands[id]?.(...args);
    },
};

export const workspace: Record<string, any> = {
    getConfiguration: (_section?: string) => ({
        get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
        update: async (_key: string, _value: any, _target?: any): Promise<void> => {},
    }),
    findFiles: async (_include: any, _exclude?: any): Promise<any[]> => [],
    createFileSystemWatcher: (_glob: string) => ({
        onDidChange: () => ({ dispose: () => { /* no-op */ } }),
        onDidCreate: () => ({ dispose: () => { /* no-op */ } }),
        onDidDelete: () => ({ dispose: () => { /* no-op */ } }),
        dispose: () => { /* no-op */ },
    }),
    openTextDocument: async (_uri: any) => null,
    applyEdit: async () => true,
    fs: {
        readFile: async () => new Uint8Array(),
    },
};

export const languages = {
    createDiagnosticCollection: (name: string): MockDiagnosticCollection => {
        const col = new MockDiagnosticCollection(name);
        createdDiagnosticCollections.push(col);
        return col;
    },
    registerHoverProvider: (_selector: any, _provider: any) => {
        return { dispose: () => { /* no-op */ } };
    },
    registerCodeActionsProvider: (_selector: any, _provider: any, _metadata?: any) => {
        return { dispose: () => { /* no-op */ } };
    },
};

export class Selection {
    readonly start: Position;
    readonly end: Position;
    constructor(anchor: Position, active: Position) {
        this.start = anchor;
        this.end = active;
    }
}

export const clipboardMock = {
    text: '',
    reset() { this.text = ''; },
};

export const envMock = {
    openedUrls: [] as string[],
    reset() { this.openedUrls.length = 0; clipboardMock.text = ''; },
};

export const env = {
    clipboard: {
        writeText: async (text: string) => { clipboardMock.text = text; },
        readText: async () => clipboardMock.text,
    },
    openExternal: async (uri: any) => {
        envMock.openedUrls.push(uri.toString());
        return true;
    },
};

export const Uri = {
    parse: (v: string) => ({ toString: () => v, scheme: 'http', path: v, fsPath: v }),
    file: (p: string) => ({ toString: () => p, scheme: 'file', path: p, fsPath: p }),
};

export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
}

export enum ProgressLocation {
    Notification = 15,
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export class WorkspaceEdit {
    private _edits: any[] = [];
    replace(uri: any, range: any, newText: string): void {
        this._edits.push({ uri, range, newText });
    }
    getEdits(): any[] { return this._edits; }
}

/** Reset all shared mock state between tests. */
export function resetMocks(): void {
    createdPanels.length = 0;
    createdTreeViews.length = 0;
    createdDiagnosticCollections.length = 0;
    messageMock.reset();
    envMock.reset();
    for (const key of Object.keys(registeredCommands)) {
        delete registeredCommands[key];
    }
}
