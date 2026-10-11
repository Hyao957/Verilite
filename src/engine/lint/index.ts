import { lex } from "../../core/lexer";
import type { Dialect, LexResult } from "../../core/types";
import { checkBrackets } from "./bracketRule";
import { LINE_RULES } from "./lineRule";
import { checkPairs } from "./pairRule";
import { SV_RULES } from "./svRule";
import { DEFAULT_LINT_OPTIONS } from "./types";
import type { LintIssue, LintOptions, LintResult, LintRule } from "./types";

export type { LintIssue, LintOptions, LintResult, LintRule, LintSeverity } from "./types";
export { DEFAULT_LINT_OPTIONS } from "./types";

const SEVERITY_ORDER = { error: 0, warning: 1, hint: 2 } as const;
const BOTH: Dialect[] = ["verilog", "systemverilog"];

/**
 * The full lint rule registry. The scheduler below runs a rule only when the
 * document's dialect appears in its `dialects` list, so a dialect-specific rule
 * is added simply by registering it here.
 */
export const LINT_RULES: LintRule[] = [
	{ name: "brackets", dialects: BOTH, run: (lexed) => checkBrackets(lexed) },
	{ name: "pairs", dialects: BOTH, run: (lexed, _o, d) => checkPairs(lexed, d) },
	...LINE_RULES,
	...SV_RULES,
];

/** Lint an already-lexed document. `rules` is injectable for testing. */
export function lintLexed(
	lexed: LexResult,
	options: Partial<LintOptions> = {},
	dialect: Dialect = "verilog",
	rules: LintRule[] = LINT_RULES,
): LintResult {
	const opts: LintOptions = { ...DEFAULT_LINT_OPTIONS, ...options };

	const all: LintIssue[] = [];
	for (const rule of rules) {
		if (!rule.dialects.includes(dialect)) continue;
		all.push(...rule.run(lexed, opts, dialect));
	}

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
	dialect: Dialect = "verilog",
): LintResult {
	return lintLexed(lex(text, dialect), options, dialect);
}
