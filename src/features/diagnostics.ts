import * as vscode from "vscode";
import { LANGUAGE_ID, readConfig } from "../config";
import { lint } from "../engine/lint";
import type { LintIssue, LintSeverity } from "../engine/lint";

const SEVERITY_MAP: Record<LintSeverity, vscode.DiagnosticSeverity> = {
	error: vscode.DiagnosticSeverity.Error,
	warning: vscode.DiagnosticSeverity.Warning,
	hint: vscode.DiagnosticSeverity.Hint,
};

function toDiagnostic(document: vscode.TextDocument, issue: LintIssue): vscode.Diagnostic {
	const lineText = issue.line < document.lineCount ? document.lineAt(issue.line).text : "";
	const start = Math.min(Math.max(issue.col, 0), lineText.length);
	const end = Math.min(Math.max(issue.endCol, start + 1), Math.max(lineText.length, start + 1));

	const diagnostic = new vscode.Diagnostic(
		new vscode.Range(issue.line, start, issue.line, end),
		issue.message,
		SEVERITY_MAP[issue.severity],
	);
	diagnostic.source = "VeriLite";
	diagnostic.code = issue.code;
	return diagnostic;
}

/**
 * Owns the diagnostic collection and decides when to re-run the checker.
 *
 * Checking is debounced while typing so a fast typist never triggers a scan
 * per keystroke, and the timer is keyed per document.
 */
export class DiagnosticsController implements vscode.Disposable {
	private readonly collection: vscode.DiagnosticCollection;
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly disposables: vscode.Disposable[] = [];

	constructor() {
		this.collection = vscode.languages.createDiagnosticCollection("verilite");

		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((doc) => this.schedule(doc, true)),
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (readConfig(e.document.uri).lintRunOn === "type") this.schedule(e.document, false);
			}),
			vscode.workspace.onDidSaveTextDocument((doc) => {
				const runOn = readConfig(doc.uri).lintRunOn;
				if (runOn === "type" || runOn === "save") this.schedule(doc, true);
			}),
			vscode.workspace.onDidCloseTextDocument((doc) => this.forget(doc)),
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration("verilite.lint")) this.refreshAll();
			}),
		);

		// documents already open when the extension activates
		for (const doc of vscode.workspace.textDocuments) this.schedule(doc, true);
	}

	/** Check immediately, ignoring the runOn setting. Used by the command. */
	runNow(document: vscode.TextDocument): void {
		this.cancel(document.uri.toString());
		this.run(document);
	}

	clearAll(): void {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		this.collection.clear();
	}

	private refreshAll(): void {
		for (const doc of vscode.workspace.textDocuments) this.schedule(doc, true);
	}

	private schedule(document: vscode.TextDocument, immediate: boolean): void {
		if (document.languageId !== LANGUAGE_ID) return;

		const key = document.uri.toString();
		this.cancel(key);

		if (immediate) {
			this.run(document);
			return;
		}

		const delay = readConfig(document.uri).lintDebounceMs;
		this.timers.set(
			key,
			setTimeout(() => {
				this.timers.delete(key);
				this.run(document);
			}, Math.max(0, delay)),
		);
	}

	private run(document: vscode.TextDocument): void {
		if (document.languageId !== LANGUAGE_ID || document.isClosed) return;

		const config = readConfig(document.uri);
		if (!config.lintEnabled) {
			this.collection.delete(document.uri);
			return;
		}

		try {
			const { issues } = lint(document.getText(), config.lint);
			this.collection.set(
				document.uri,
				issues.map((issue) => toDiagnostic(document, issue)),
			);
		} catch (err) {
			// a crashing checker must never break editing
			console.error("[VeriLite] lint failed", err);
			this.collection.delete(document.uri);
		}
	}

	private cancel(key: string): void {
		const timer = this.timers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(key);
		}
	}

	private forget(document: vscode.TextDocument): void {
		this.cancel(document.uri.toString());
		this.collection.delete(document.uri);
	}

	dispose(): void {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		for (const d of this.disposables) d.dispose();
		this.disposables.length = 0;
		this.collection.dispose();
	}
}
