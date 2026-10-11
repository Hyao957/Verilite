import * as vscode from "vscode";
import type { Dialect } from "../core/types";
import { foldRegions } from "../engine/folding";
import type { FoldKind } from "../engine/folding";
import type { AnalysisService } from "./analysis";

const KIND_MAP: Record<FoldKind, vscode.FoldingRangeKind> = {
	comment: vscode.FoldingRangeKind.Comment,
	region: vscode.FoldingRangeKind.Region,
};

/**
 * Folding ranges for the block structures and comment runs computed by the
 * shared {@link AnalysisService}, so folding costs no extra lexing per edit.
 */
export function registerFolding(dialect: Dialect, analysis: AnalysisService): vscode.Disposable {
	const provider: vscode.FoldingRangeProvider = {
		provideFoldingRanges(document): vscode.FoldingRange[] {
			return foldRegions(analysis.analyze(document).lexed, dialect).map(
				(r) => new vscode.FoldingRange(r.start, r.end, r.kind ? KIND_MAP[r.kind] : undefined),
			);
		},
	};

	return vscode.languages.registerFoldingRangeProvider({ language: dialect, scheme: "*" }, provider);
}