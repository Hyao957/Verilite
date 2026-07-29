/**
 * Shared types for the VeriLite core layer.
 * Nothing in `src/core` or `src/engine` may import `vscode`, so the whole
 * analysis layer stays testable with plain Node.
 */

export type TokenKind =
	| "keyword"
	| "identifier"
	| "number"
	| "operator"
	| "punctuation"
	| "directive"
	| "systemTask";

export interface Token {
	/** Text as it appears in the masked mirror (identical to source for code). */
	text: string;
	/** Lower-cased text, used for all keyword comparisons. */
	lower: string;
	/** 0-based line index. */
	line: number;
	/** 0-based start column. */
	col: number;
	/** 0-based end column (exclusive). */
	endCol: number;
	kind: TokenKind;
}

export type LineKind = "code" | "comment" | "blank" | "directive";

export interface Position {
	line: number;
	col: number;
}

/** Half-open [start, end) column range inside one line. */
export type ColRange = [number, number];

export interface LexResult {
	/** Same length as the input; comment / string content replaced by spaces. */
	masked: string;
	maskedLines: string[];
	rawLines: string[];
	tokens: Token[];
	/** tokens grouped by line index */
	tokensByLine: Token[][];
	lineKinds: LineKind[];
	/** true when the line begins inside an unterminated block comment */
	lineStartsInBlockComment: boolean[];
	/** round-bracket depth at the beginning of each line */
	parenDepthAtLineStart: number[];
	/** comment / string spans per line, used by the formatter to skip them */
	protectedRanges: ColRange[][];
	unterminatedString: Position | null;
	unterminatedBlockComment: Position | null;
}
