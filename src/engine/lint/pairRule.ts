import { BLOCK_PAIRS, CLOSER_TO_OPENERS } from "../../core/keywords";
import type { LexResult, Token } from "../../core/types";
import type { LintIssue } from "./types";

interface Frame {
	word: string;
	token: Token;
}

/**
 * R1 - block keyword pairing.
 *
 * Matches begin/end, case/endcase, module/endmodule, fork/join, `ifdef/`endif...
 * using a simple stack over the token stream produced from masked text.
 */
export function checkPairs(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	const stack: Frame[] = [];
	const tokens = lex.tokens;

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.kind !== "keyword" && t.kind !== "directive") continue;
		const w = t.lower;
		const prev = i > 0 ? tokens[i - 1].lower : "";

		// `disable fork` / `wait fork` are not block openers
		if (w === "fork" && (prev === "disable" || prev === "wait")) continue;
		// `default` inside a case is not the `default_nettype` directive
		if (w === "`elsif" || w === "`else") continue;

		if (BLOCK_PAIRS[w]) {
			stack.push({ word: w, token: t });
			continue;
		}

		const openers = CLOSER_TO_OPENERS[w];
		if (!openers) continue;

		if (stack.length === 0) {
			issues.push({
				line: t.line,
				col: t.col,
				endCol: t.endCol,
				severity: "error",
				code: "unmatched-closer",
				message: `\u591a\u4f59\u7684 '${t.text}'\uff0c\u627e\u4e0d\u5230\u4e0e\u4e4b\u5339\u914d\u7684 '${openers.join("' / '")}'`,
			});
			continue;
		}

		const top = stack[stack.length - 1];
		if (openers.includes(top.word)) {
			stack.pop();
		} else {
			stack.pop();
			issues.push({
				line: t.line,
				col: t.col,
				endCol: t.endCol,
				severity: "error",
				code: "mismatched-pair",
				message: `'${t.text}' \u4e0e\u7b2c ${top.token.line + 1} \u884c\u7684 '${top.token.text}' \u4e0d\u5339\u914d`,
			});
		}
	}

	for (const frame of stack) {
		const expected = BLOCK_PAIRS[frame.word].join("' / '");
		issues.push({
			line: frame.token.line,
			col: frame.token.col,
			endCol: frame.token.endCol,
			severity: "error",
			code: "missing-closer",
			message: `\u7f3a\u5c11\u4e0e '${frame.token.text}' \u5339\u914d\u7684 '${expected}'`,
		});
	}

	return issues;
}
