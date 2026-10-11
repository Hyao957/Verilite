import * as vscode from "vscode";
import type { Dialect } from "../core/types";
import { AnalysisCache } from "../engine/analysis";
import type { DocumentAnalysis } from "../engine/analysis";

/**
 * Thin VS Code adapter around {@link AnalysisCache}. It owns the per-document
 * lifecycle (dropping the entry when a document closes) so every feature can
 * just call `analyze(document)` and share one lex + symbol scan per edit.
 */
export class AnalysisService implements vscode.Disposable {
	private readonly cache: AnalysisCache;
	private readonly disposables: vscode.Disposable[];

	constructor(dialect: Dialect) {
		this.cache = new AnalysisCache(dialect);
		this.disposables = [
			vscode.workspace.onDidCloseTextDocument((doc) => this.cache.forget(doc.uri.toString())),
		];
	}

	analyze(document: vscode.TextDocument): DocumentAnalysis {
		return this.cache.get(document.uri.toString(), document.version, document.getText());
	}

	dispose(): void {
		for (const d of this.disposables) d.dispose();
		this.disposables.length = 0;
		this.cache.clear();
	}
}