import type { LexResult } from "../../core/types";
import type { LintIssue } from "./types";

const OPEN_TO_CLOSE: Record<string, string> = {
	"(": ")",
	"[": "]",
	"{": "}",
};
const CLOSE_TO_OPEN: Record<string, string> = {
	")": "(",
	"]": "[",
	"}": "{",
};

/**
 * R2 - bracket balance plus unterminated string / block comment.
 * Runs on the masked mirror, so brackets inside comments and strings are
 * ignored by construction.
 */
export function checkBrackets(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	const stack: Array<{ ch: string; line: number; col: number }> = [];

	for (let line = 0; line < lex.maskedLines.length; line++) {
		const text = lex.maskedLines[line];
		for (let col = 0; col < text.length; col++) {
			const ch = text[col];
			if (OPEN_TO_CLOSE[ch]) {
				stack.push({ ch, line, col });
			} else if (CLOSE_TO_OPEN[ch]) {
				const top = stack.pop();
				if (!top) {
					issues.push({
						line,
						col,
						endCol: col + 1,
						severity: "error",
						code: "unmatched-bracket",
						message: `\u591a\u4f59\u7684 '${ch}'\uff0c\u7f3a\u5c11\u5bf9\u5e94\u7684 '${CLOSE_TO_OPEN[ch]}'`,
					});
				} else if (OPEN_TO_CLOSE[top.ch] !== ch) {
					issues.push({
						line,
						col,
						endCol: col + 1,
						severity: "error",
						code: "mismatched-bracket",
						message: `'${ch}' \u4e0e\u7b2c ${top.line + 1} \u884c\u7684 '${top.ch}' \u4e0d\u5339\u914d`,
					});
				}
			}
		}
	}

	for (const open of stack) {
		issues.push({
			line: open.line,
			col: open.col,
			endCol: open.col + 1,
			severity: "error",
			code: "unclosed-bracket",
			message: `'${open.ch}' \u672a\u95ed\u5408\uff0c\u7f3a\u5c11 '${OPEN_TO_CLOSE[open.ch]}'`,
		});
	}

	if (lex.unterminatedString) {
		issues.push({
			line: lex.unterminatedString.line,
			col: lex.unterminatedString.col,
			endCol: lex.unterminatedString.col + 1,
			severity: "error",
			code: "unterminated-string",
			message: "\u5b57\u7b26\u4e32\u672a\u95ed\u5408\uff0c\u7f3a\u5c11\u7ed3\u675f\u7684\u53cc\u5f15\u53f7",
		});
	}

	if (lex.unterminatedBlockComment) {
		issues.push({
			line: lex.unterminatedBlockComment.line,
			col: lex.unterminatedBlockComment.col,
			endCol: lex.unterminatedBlockComment.col + 2,
			severity: "error",
			code: "unterminated-comment",
			message: "\u5757\u6ce8\u91ca\u672a\u95ed\u5408\uff0c\u7f3a\u5c11 '*/'",
		});
	}

	return issues;
}
