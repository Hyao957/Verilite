import { INDENT_CLOSERS, INDENT_OPENERS } from "../../core/keywords";
import type { LexResult } from "../../core/types";

export interface IndentPlan {
	/** indent level per line; -1 means "leave the raw line untouched" */
	levels: number[];
	/** indent level that would apply to the line after the last one */
	endLevel: number;
}

function isCloserToken(text: string, lower: string): boolean {
	return INDENT_CLOSERS.has(lower) || text === ")" || text === "}";
}

/**
 * True when the next code line (skipping blanks, comments and directives)
 * begins with a `begin`/`fork` block. Used to tell a genuine single-statement
 * body apart from a block body that simply starts on the following line.
 */
function nextCodeLineStartsBlock(lexed: LexResult, from: number): boolean {
	for (let n = from; n < lexed.maskedLines.length; n++) {
		const k = lexed.lineKinds[n];
		if (k === "blank" || k === "comment" || k === "directive") continue;
		const toks = lexed.tokensByLine[n];
		if (!toks || toks.length === 0) continue;
		const lw = toks[0].lower;
		return lw === "begin" || lw === "fork";
	}
	return false;
}

/**
 * Statement heads that indent a following single statement when they are not
 * followed by `begin`.
 */
export const SINGLE_STATEMENT_HEADS = new Set([
	"if", "else", "for", "while", "repeat",
	"always", "always_ff", "always_comb", "always_latch",
]);

/**
 * Pass 1 of the formatter: work out an indent level for every line.
 *
 * Three things beyond plain bracket counting:
 *
 * 1. `module` is NOT treated as a normal opener. The body indent is raised by
 *    the `;` that terminates the port list, so both `module foo;` and the
 *    multi-line `module foo #( ... ) ( ... );` form end up with exactly one
 *    level of body indent instead of two.
 *
 * 2. Single-statement bodies. `if (cond)` on its own line indents the next
 *    statement by one level and then returns, without any begin/end.
 *
 * 3. Hanging indent. A line whose statement is unfinished (it ends with `,`
 *    or a binary operator) indents its continuation lines by one level.
 */
export function planIndent(lexed: LexResult, startLevel = 0): IndentPlan {
	const levels: number[] = [];
	let level = startLevel;
	let pendingModuleHeader = false;
	let hanging = 0;
	/** running depth of block keywords (begin/case/fork/...), excluding parens */
	let blockDepth = 0;
	/**
	 * Single-statement bodies pending close: the level to return to, and the
	 * block depth at which each was opened.
	 */
	const singleStack: Array<{ level: number; blockDepth: number }> = [];

	for (let i = 0; i < lexed.maskedLines.length; i++) {
		if (lexed.lineStartsInBlockComment[i]) {
			levels.push(-1); // inside a block comment: never touch
			continue;
		}

		const kind = lexed.lineKinds[i];
		if (kind === "blank") {
			levels.push(0);
			continue;
		}
		if (kind === "comment" || kind === "directive") {
			levels.push(Math.max(0, level + hanging));
			continue;
		}

		const toks = lexed.tokensByLine[i];
		if (toks.length === 0) {
			levels.push(Math.max(0, level + hanging));
			continue;
		}

		let closeAtStart = 0;
		for (const t of toks) {
			if (isCloserToken(t.text, t.lower)) closeAtStart++;
			else break;
		}

		levels.push(Math.max(0, level - closeAtStart + hanging));

		let opens = 0;
		let closes = 0;
		let extraAfter = 0;
		let parens = 0;
		let blockOpens = 0;
		let blockCloses = 0;

		for (let k = 0; k < toks.length; k++) {
			const t = toks[k];
			const prev = k > 0 ? toks[k - 1].lower : "";

			if (t.text === "(" || t.text === "{") {
				opens++;
				if (t.text === "(") parens++;
				continue;
			}
			if (t.text === ")" || t.text === "}") {
				closes++;
				if (t.text === ")") parens--;
				continue;
			}
			if (t.text === ";") {
				if (parens <= 0 && pendingModuleHeader) {
					extraAfter++;
					pendingModuleHeader = false;
				}
				continue;
			}
			if (t.kind !== "keyword") continue;

			if (t.lower === "module" || t.lower === "macromodule") {
				pendingModuleHeader = true;
				continue;
			}
			if (t.lower === "fork" && (prev === "disable" || prev === "wait")) continue;
			if (INDENT_OPENERS.has(t.lower)) {
				opens++;
				blockOpens++;
			} else if (INDENT_CLOSERS.has(t.lower)) {
				closes++;
				blockCloses++;
			}
		}

		const first = toks[0];
		const last = toks[toks.length - 1];
		const depthAtEnd = lexed.parenDepthAtLineStart[i + 1] ?? 0;

		const statementTerminated = last.text === ";" && depthAtEnd === 0;
		const netDedent = closes > opens;
		// A trailing `:` is a case label (branch body on the next line), not a
		// continued expression, so it must not trigger a hanging indent.
		const continues =
			depthAtEnd === 0 &&
			(last.text === "," || (last.kind === "operator" && last.text !== ":"));

		level = Math.max(0, level + opens - closes + extraAfter);
		blockDepth = Math.max(0, blockDepth + blockOpens - blockCloses);

		// A single-statement body ends only once we are back at the block depth it
		// was opened at. Without the depth check, the first `;` inside a nested
		// `begin`/`case` block (e.g. `else case (s) ... endcase`) would close the
		// body early and collapse everything that follows.
		while (
			singleStack.length > 0 &&
			blockDepth <= singleStack[singleStack.length - 1].blockDepth &&
			(statementTerminated || netDedent)
		) {
			level = Math.max(0, (singleStack.pop() as { level: number }).level);
		}

		// `if (...)` / `else` / `for (...)` with no `begin` indents one statement.
		// But when the body is actually a `begin`/`fork` block on the next line,
		// the block manages its own indent, so we must NOT enter single-statement
		// mode here - otherwise the stale entry collapses the whole block.
		const opensSingleStatement =
			depthAtEnd === 0 &&
			opens === closes &&
			((last.text === ")" && SINGLE_STATEMENT_HEADS.has(first.lower)) ||
				last.lower === "else" ||
				last.lower === "forever" ||
				last.lower === "initial") &&
			!nextCodeLineStartsBlock(lexed, i + 1);

		if (opensSingleStatement) {
			singleStack.push({ level, blockDepth });
			level += 1;
		}

		hanging = continues ? 1 : 0;
	}

	return { levels, endLevel: level };
}

/** Indent level that a new line appended after `text` would get. */
export function endLevelOf(lexed: LexResult, startLevel = 0): number {
	return planIndent(lexed, startLevel).endLevel;
}
