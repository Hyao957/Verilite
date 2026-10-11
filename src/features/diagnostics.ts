import * as vscode from "vscode";
import type { Dialect } from "../core/types";
import { readConfig } from "../config";
import { lintLexed } from "../engine/lint";
import type { LintIssue, LintSeverity } from "../engine/lint";
import type { AnalysisService } from "./analysis";

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

	constructor(
		private readonly dialect: Dialect,
		private readonly analysis: AnalysisService,
	) {
		this.collection = vscode.languages.createDiagnosticCollection(`verilite-${dialect}`);

		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((doc) => this.schedule(doc, true)),
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (e.document.languageId !== this.dialect) return;
				if (readConfig(e.document).lintRunOn === "type") this.schedule(e.document, false);
			}),
			vscode.workspace.onDidSaveTextDocument((doc) => {
				if (doc.languageId !== this.dialect) return;
				const runOn = readConfig(doc).lintRunOn;
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
		if (document.languageId !== this.dialect) {
			// document no longer belongs to this dialect (e.g. language-mode switch)
			this.collection.delete(document.uri);
			return;
		}

		const key = document.uri.toString();
		this.cancel(key);

		if (immediate) {
			this.run(document);
			return;
		}

		const delay = readConfig(document).lintDebounceMs;
		this.timers.set(
			key,
			setTimeout(() => {
				this.timers.delete(key);
				this.run(document);
			}, Math.max(0, delay)),
		);
	}

	private run(document: vscode.TextDocument): void {
		if (document.languageId !== this.dialect || document.isClosed) return;

		const config = readConfig(document);
		if (!config.lintEnabled) {
			this.collection.delete(document.uri);
			return;
		}

		try {
			const { issues } = lintLexed(this.analysis.analyze(document).lexed, config.lint, this.dialect);
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
