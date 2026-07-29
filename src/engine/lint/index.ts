import { lex } from "../../core/lexer";
import type { LexResult } from "../../core/types";
import { checkBrackets } from "./bracketRule";
import { checkLines } from "./lineRule";
import { checkPairs } from "./pairRule";
import { DEFAULT_LINT_OPTIONS } from "./types";
import type { LintIssue, LintOptions, LintResult } from "./types";

export type { LintIssue, LintOptions, LintResult, LintSeverity } from "./types";
export { DEFAULT_LINT_OPTIONS } from "./types";

const SEVERITY_ORDER = { error: 0, warning: 1, hint: 2 } as const;

/** Lint an already-lexed document. */
export function lintLexed(
	lexed: LexResult,
	options: Partial<LintOptions> = {},
): LintResult {
	const opts: LintOptions = { ...DEFAULT_LINT_OPTIONS, ...options };

	const all: LintIssue[] = [
		...checkBrackets(lexed),
		...checkPairs(lexed),
		...checkLines(lexed, opts),
	];

	all.sort((a, b) => {
		if (a.line !== b.line) return a.line - b.line;
		if (a.col !== b.col) return a.col - b.col;
		return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
	});

	const truncated = all.length > opts.maxIssues;
	const issues = truncated ? all.slice(0, opts.maxIssues) : all;

	if (truncated) {
		issues.push({
			line: 0,
			col: 0,
			endCol: 1,
			severity: "hint",
			code: "too-many-issues",
			message: `\u95ee\u9898\u8fc7\u591a\uff0c\u4ec5\u663e\u793a\u524d ${opts.maxIssues} \u6761\uff08\u5171 ${all.length} \u6761\uff09`,
		});
	}

	return { issues, truncated };
}

/** Lint raw Verilog source text. */
export function lint(
	text: string,
	options: Partial<LintOptions> = {},
): LintResult {
	return lintLexed(lex(text), options);
}
