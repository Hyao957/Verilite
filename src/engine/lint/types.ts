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
