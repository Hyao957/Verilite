import { indentPairsFor } from "../../core/keywords";
import type { Dialect, LexResult, Token } from "../../core/types";
import type { LintIssue, LintRule } from "./types";

function nextCodeLine(lex: LexResult, from: number): number {
	for (let i = from; i < lex.lineKinds.length; i++) {
		if (lex.lineKinds[i] === "code") return i;
	}
	return -1;
}

function atLineEnd(token: Token): { line: number; col: number; endCol: number } {
	return { line: token.line, col: token.col, endCol: token.endCol };
}

/** R3.1 - nothing but another module / directive may follow `endmodule`. */
function codeAfterEndmodule(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	const tokens = lex.tokens;
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].lower !== "endmodule") continue;
		const next = tokens[i + 1];
		if (!next) break;
		if (next.kind === "directive") continue;
		if (next.lower === "module" || next.lower === "macromodule") continue;
		if (next.lower === "endmodule") continue;
		issues.push({
			...atLineEnd(next),
			severity: "error",
			code: "code-after-endmodule",
			message: "'endmodule' \u4e4b\u540e\u4e0d\u5e94\u518d\u6709\u4ee3\u7801\uff0c\u53ef\u80fd\u662f 'endmodule' \u5199\u65e9\u4e86",
		});
		break;
	}
	return issues;
}

/** R3.2 - `always begin` has no sensitivity list. */
function alwaysNoSensitivity(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	const tokens = lex.tokens;
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].lower !== "always") continue;
		const next = tokens[i + 1];
		if (next && next.lower === "begin") {
			issues.push({
				...atLineEnd(tokens[i]),
				severity: "warning",
				code: "always-no-sensitivity",
				message: "'always' \u540e\u9762\u7f3a\u5c11\u654f\u611f\u5217\u8868\uff08\u5982 @(posedge clk) \u6216 @(*)\uff09\uff1b\u4ec5\u5728 testbench \u4e2d\u5199 'always begin' \u624d\u5408\u6cd5",
			});
		}
	}
	return issues;
}

/** R3.3 - declaration line that forgot its trailing semicolon. */
function missingSemicolon(lex: LexResult, dialect: Dialect): LintIssue[] {
	const { statementStarters, declarationStarters } = indentPairsFor(dialect);
	const issues: LintIssue[] = [];

	for (let i = 0; i < lex.lineKinds.length; i++) {
		if (lex.lineKinds[i] !== "code") continue;
		if (lex.parenDepthAtLineStart[i] !== 0) continue;
		const toks = lex.tokensByLine[i];
		if (toks.length === 0) continue;

		const first = toks[0];
		const last = toks[toks.length - 1];
		if (!declarationStarters.has(first.lower)) continue;
		if (last.text === ";" || last.text === ",") continue;
		if (last.kind === "operator") continue; // line continues
		if (last.text === "(" || last.text === "{" || last.text === "[") continue;
		// still inside an open paren at end of line -> multi-line statement
		if ((lex.parenDepthAtLineStart[i + 1] ?? 0) !== 0) continue;

		const nextLine = nextCodeLine(lex, i + 1);
		if (nextLine < 0) continue;
		const nextFirst = lex.tokensByLine[nextLine][0];
		if (!nextFirst) continue;
		if (!statementStarters.has(nextFirst.lower)) continue;

		issues.push({
			line: last.line,
			col: last.col,
			endCol: last.endCol,
			severity: "error",
			code: "missing-semicolon",
			message: "\u8bed\u53e5\u672b\u5c3e\u7f3a\u5c11\u5206\u53f7 ';'",
		});
	}

	return issues;
}

/** R3.4 - a lone `)` closing a port list / task call that forgot the `;`. */
function missingSemicolonAfterCloseParen(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	for (let i = 0; i < lex.lineKinds.length; i++) {
		if (lex.lineKinds[i] !== "code") continue;
		if (lex.maskedLines[i].trim() !== ")") continue;
		if ((lex.parenDepthAtLineStart[i + 1] ?? 0) !== 0) continue;

		const nextLine = nextCodeLine(lex, i + 1);
		if (nextLine < 0) continue;
		const nextFirst = lex.tokensByLine[nextLine][0];
		if (!nextFirst) continue;
		if (nextFirst.lower === "begin" || nextFirst.text === ";") continue;
		if (nextFirst.text === "(") continue;

		const tok = lex.tokensByLine[i][0];
		issues.push({
			line: i,
			col: tok.col,
			endCol: tok.endCol,
			severity: "error",
			code: "missing-semicolon",
			message: "')' \u4e4b\u540e\u7f3a\u5c11\u5206\u53f7 ';'",
		});
	}
	return issues;
}

/** R3.5 - case without a default branch. */
function caseWithoutDefault(lex: LexResult, dialect: Dialect): LintIssue[] {
	const { blockPairs, closerToOpeners } = indentPairsFor(dialect);
	const issues: LintIssue[] = [];
	const stack: Array<{ opener: string; isCase: boolean; token: Token; hasDefault: boolean }> = [];
	const tokens = lex.tokens;

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.kind !== "keyword") continue;
		const w = t.lower;

		if (blockPairs[w]) {
			const prev = i > 0 ? tokens[i - 1].lower : "";
			if (w === "fork" && (prev === "disable" || prev === "wait")) continue;
			stack.push({
				opener: w,
				// `randcase` needs a frame so its `endcase` pairs up correctly, but
				// it does not require a default branch, so it is never reported.
				isCase: w === "case" || w === "casex" || w === "casez",
				token: t,
				hasDefault: false,
			});
			continue;
		}

		if (w === "default") {
			for (let s = stack.length - 1; s >= 0; s--) {
				if (stack[s].isCase) {
					stack[s].hasDefault = true;
					break;
				}
			}
			continue;
		}

		if (!closerToOpeners[w]) continue;

		// Close the innermost opener that accepts this keyword, exactly like the
		// pair checker, so SystemVerilog `randcase` / `randsequence` cannot desync
		// the frames the way a flat open/close set would.
		for (let k = stack.length - 1; k >= 0; k--) {
			const frame = stack[k];
			if (!blockPairs[frame.opener].includes(w)) continue;
			stack.splice(k, 1);
			if (w === "endcase" && frame.isCase && !frame.hasDefault) {
				issues.push({
					line: frame.token.line,
					col: frame.token.col,
					endCol: frame.token.endCol,
					severity: "warning",
					code: "case-without-default",
					message: "case \u8bed\u53e5\u7f3a\u5c11 default \u5206\u652f\uff0c\u53ef\u80fd\u7efc\u5408\u51fa\u9501\u5b58\u5668",
				});
			}
			break;
		}
	}

	return issues;
}

type AlwaysKind = "sequential" | "combinational" | "unknown";

/** R3.6 - blocking assignment in a sequential block and vice versa. */
function assignmentStyle(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	const tokens = lex.tokens;

	for (let i = 0; i < tokens.length; i++) {
		const w = tokens[i].lower;
		let kind: AlwaysKind = "unknown";
		let cursor = i + 1;

		if (w === "always_ff") kind = "sequential";
		else if (w === "always_comb" || w === "always_latch") kind = "combinational";
		else if (w === "always") {
			if (tokens[cursor] && tokens[cursor].text === "@") {
				cursor++;
				if (tokens[cursor] && tokens[cursor].text === "*") {
					kind = "combinational";
					cursor++;
				} else if (tokens[cursor] && tokens[cursor].text === "(") {
					let depth = 0;
					let sawEdge = false;
					while (cursor < tokens.length) {
						const tk = tokens[cursor];
						if (tk.text === "(") depth++;
						else if (tk.text === ")") {
							depth--;
							if (depth === 0) {
								cursor++;
								break;
							}
						} else if (tk.lower === "posedge" || tk.lower === "negedge") {
							sawEdge = true;
						}
						cursor++;
					}
					kind = sawEdge ? "sequential" : "combinational";
				}
			}
		} else {
			continue;
		}

		if (kind === "unknown") continue;

		// determine the body token range
		let endIndex = cursor;
		if (tokens[cursor] && tokens[cursor].lower === "begin") {
			let depth = 0;
			let j = cursor;
			for (; j < tokens.length; j++) {
				const lw = tokens[j].lower;
				if (lw === "begin" || lw === "case" || lw === "casex" || lw === "casez" || lw === "fork") depth++;
				else if (lw === "end" || lw === "endcase" || lw === "join" || lw === "join_any" || lw === "join_none") {
					depth--;
					if (depth === 0) break;
				}
			}
			endIndex = Math.min(j, tokens.length - 1);
		} else {
			let parens = 0;
			let j = cursor;
			for (; j < tokens.length; j++) {
				if (tokens[j].text === "(") parens++;
				else if (tokens[j].text === ")") parens--;
				else if (tokens[j].text === ";" && parens <= 0) break;
			}
			endIndex = Math.min(j, tokens.length - 1);
		}

		let parenDepth = 0;
		for (let j = cursor; j <= endIndex; j++) {
			const tk = tokens[j];
			if (tk.text === "(") parenDepth++;
			else if (tk.text === ")") parenDepth = Math.max(0, parenDepth - 1);
			if (parenDepth !== 0) continue;

			if (tk.text === "=" && kind === "sequential") {
				issues.push({
					line: tk.line,
					col: tk.col,
					endCol: tk.endCol,
					severity: "warning",
					code: "blocking-in-sequential",
					message: "\u65f6\u5e8f\u903b\u8f91\u4e2d\u5efa\u8bae\u4f7f\u7528\u975e\u963b\u585e\u8d4b\u503c '<='",
				});
			} else if (tk.text === "<=" && kind === "combinational") {
				issues.push({
					line: tk.line,
					col: tk.col,
					endCol: tk.endCol,
					severity: "warning",
					code: "nonblocking-in-combinational",
					message: "\u7ec4\u5408\u903b\u8f91\u4e2d\u5efa\u8bae\u4f7f\u7528\u963b\u585e\u8d4b\u503c '='",
				});
			}
		}

		i = endIndex;
	}

	return issues;
}

/** R3.7 - trailing whitespace hint. */
function trailingWhitespace(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	for (let i = 0; i < lex.rawLines.length; i++) {
		const raw = lex.rawLines[i];
		const m = /[ \t]+$/.exec(raw);
		if (!m) continue;
		issues.push({
			line: i,
			col: m.index,
			endCol: raw.length,
			severity: "hint",
			code: "trailing-whitespace",
			message: "\u884c\u5c3e\u6709\u591a\u4f59\u7684\u7a7a\u767d\u5b57\u7b26",
		});
	}
	return issues;
}

const BOTH: Dialect[] = ["verilog", "systemverilog"];

/**
 * The line-oriented rules, as `LintRule` objects. The scheduler in `index.ts`
 * filters these by dialect and concatenates the results (order is irrelevant:
 * `lintLexed` sorts before returning). Option-gated rules return `[]` when
 * their flag is off.
 */
export const LINE_RULES: LintRule[] = [
	{ name: "code-after-endmodule", dialects: BOTH, run: (lex) => codeAfterEndmodule(lex) },
	{ name: "missing-semicolon", dialects: BOTH, run: (lex, _o, d) => missingSemicolon(lex, d) },
	{ name: "missing-semicolon-after-paren", dialects: BOTH, run: (lex) => missingSemicolonAfterCloseParen(lex) },
	{ name: "always-no-sensitivity", dialects: BOTH, run: (lex, o) => (o.warnAlwaysNoSensitivity ? alwaysNoSensitivity(lex) : []) },
	{ name: "case-without-default", dialects: BOTH, run: (lex, o, d) => (o.warnMissingDefault ? caseWithoutDefault(lex, d) : []) },
	{ name: "assignment-style", dialects: BOTH, run: (lex, o) => (o.warnBlockingInSeq ? assignmentStyle(lex) : []) },
	{ name: "trailing-whitespace", dialects: BOTH, run: (lex, o) => (o.hintTrailingWhitespace ? trailingWhitespace(lex) : []) },
];
