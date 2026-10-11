import { indentPairsFor } from "../core/keywords";
import { lex } from "../core/lexer";
import type { Dialect, LexResult } from "../core/types";

export type FoldKind = "comment" | "region";

export interface FoldRange {
	/** 0-based first line of the foldable region (the opening keyword) */
	start: number;
	/** 0-based last line of the foldable region (the closing keyword) */
	end: number;
	/** only set for comment runs; block regions leave it undefined */
	kind?: FoldKind;
}

/**
 * Foldable regions of a document.
 *
 * Two sources are combined:
 *  - block regions: every block keyword is paired with its end keyword using
 *    the same table the indenter relies on (`blockPairs` / `closerToOpeners`),
 *    so folding and indentation never disagree. This covers module/begin/case/
 *    function/task/fork/generate as well as the SystemVerilog containers and
 *    the `ifdef` / `ifndef` compiler directives.
 *  - comment regions: runs of two or more consecutive comment-only lines.
 *
 * The result is sorted by start line so the client sees a stable ordering.
 */
export function foldRegions(lexedOrText: LexResult | string, dialect: Dialect = "verilog"): FoldRange[] {
	const lexed = typeof lexedOrText === "string" ? lex(lexedOrText, dialect) : lexedOrText;
	const { blockPairs, closerToOpeners } = indentPairsFor(dialect);

	const ranges: FoldRange[] = [];
	const open: { opener: string; line: number }[] = [];

	for (const token of lexed.tokens) {
		const lower = token.lower;

		if (blockPairs[lower]) {
			open.push({ opener: lower, line: token.line });
			continue;
		}

		if (!closerToOpeners[lower]) continue;

		// Close the innermost opener that accepts this keyword. Matching from the
		// top down keeps `end` from closing a `module` and vice versa.
		for (let k = open.length - 1; k >= 0; k--) {
			if (blockPairs[open[k].opener].includes(lower)) {
				const startLine = open[k].line;
				open.splice(k, 1);
				if (token.line > startLine) ranges.push({ start: startLine, end: token.line });
				break;
			}
		}
	}

	// Comment runs: a foldable group needs at least two consecutive lines.
	const kinds = lexed.lineKinds;
	let runStart = -1;
	for (let i = 0; i <= kinds.length; i++) {
		const isComment = i < kinds.length && kinds[i] === "comment";
		if (isComment) {
			if (runStart < 0) runStart = i;
			continue;
		}
		if (runStart >= 0) {
			if (i - 1 > runStart) ranges.push({ start: runStart, end: i - 1, kind: "comment" });
			runStart = -1;
		}
	}

	ranges.sort((a, b) => a.start - b.start || a.end - b.end);
	return ranges;
}