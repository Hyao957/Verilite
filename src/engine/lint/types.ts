import type { Dialect, LexResult } from "../../core/types";

export type LintSeverity = "error" | "warning" | "hint";

export interface LintIssue {
	/** 0-based line index */
	line: number;
	/** 0-based start column */
	col: number;
	/** 0-based end column (exclusive) */
	endCol: number;
	message: string;
	severity: LintSeverity;
	/** stable rule id, shown in the Problems panel */
	code: string;
}

export interface LintOptions {
	warnMissingDefault: boolean;
	warnBlockingInSeq: boolean;
	warnAlwaysNoSensitivity: boolean;
	hintTrailingWhitespace: boolean;
	maxIssues: number;
}

export const DEFAULT_LINT_OPTIONS: LintOptions = {
	warnMissingDefault: true,
	warnBlockingInSeq: true,
	warnAlwaysNoSensitivity: true,
	hintTrailingWhitespace: false,
	maxIssues: 100,
};

export interface LintResult {
	issues: LintIssue[];
	truncated: boolean;
}

/**
 * A single lint rule. The scheduler in `index.ts` runs a rule only when the
 * document's dialect is in `dialects`, so dialect-specific rules are added by
 * registering them here with the appropriate dialect list. Option-gated rules
 * return `[]` from `run` when their flag is off (they are still "run", which
 * keeps the issue ordering / truncation semantics identical).
 */
export interface LintRule {
	/** stable rule identifier (individual issues carry their own fine-grained `code`) */
	name: string;
	dialects: Dialect[];
	run(lexed: LexResult, opts: LintOptions, dialect: Dialect): LintIssue[];
}
