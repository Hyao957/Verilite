import { lex } from "../../core/lexer";
import type { Token } from "../../core/types";
import { applyAlignment } from "./align";
import { planIndent, SINGLE_STATEMENT_HEADS } from "./indent";
import { applySpacing } from "./spacing";
import { DEFAULT_FORMAT_OPTIONS, indentUnit } from "./types";
import type { FormatOptions } from "./types";

export type { FormatOptions } from "./types";
export { DEFAULT_FORMAT_OPTIONS } from "./types";
export { planIndent } from "./indent";

/** True when a code line is a control head whose body may absorb a following `begin`. */
function lineIsControlHead(toks: Token[]): boolean {
	if (toks.length === 0) return false;
	const first = toks[0];
	const last = toks[toks.length - 1];
	if (last.lower === "else" || last.lower === "forever" || last.lower === "initial") return true;
	return last.text === ")" && SINGLE_STATEMENT_HEADS.has(first.lower);
}

/**
 * Merge a `begin` that sits alone on its line up onto the preceding control
 * head, turning `always @(...)\nbegin` into `always @(...) begin`.
 *
 * Only a plain `begin` line (no label, no trailing comment) directly below a
 * paren-balanced head is touched, so the transform is conservative. It strictly
 * reduces the number of lone `begin` lines, hence it terminates and idempotent.
 */
function joinBegin(text: string): string {
	const lexed = lex(text);
	const raw = lexed.rawLines.slice();
	const remove = new Set<number>();

	for (let i = 1; i < raw.length; i++) {
		if (lexed.lineKinds[i] !== "code") continue;
		if (lexed.maskedLines[i].trim() !== "begin" || raw[i].trim() !== "begin") continue;
		const j = i - 1;
		if (remove.has(j)) continue;
		if (lexed.lineKinds[j] !== "code") continue;
		if ((lexed.parenDepthAtLineStart[i] ?? 0) !== 0) continue;
		if (!lineIsControlHead(lexed.tokensByLine[j] ?? [])) continue;
		raw[j] = raw[j].replace(/\s+$/, "") + " begin";
		remove.add(i);
	}

	if (remove.size === 0) return text;
	return raw.filter((_, idx) => !remove.has(idx)).join("\n");
}

/**
 * Format a whole Verilog document.
 *
 * Three passes, in order:
 *   1. indent    - one level per block, computed from the masked token stream
 *   2. spacing   - single space around unambiguous binary operators
 *   3. alignment - column-align consecutive port declarations
 *
 * @param startLevel indent level the first line starts at. Only non-zero when
 *                   formatting a selection in the middle of a module.
 */
export function formatText(
	text: string,
	options: Partial<FormatOptions> = {},
	startLevel = 0,
): string {
	const opts: FormatOptions = { ...DEFAULT_FORMAT_OPTIONS, ...options };

	// pass 0 (opt-in): join a lone `begin` up onto its control head, then
	// re-format the merged text. joinBegin is idempotent, so this recurses once.
	if (opts.joinBegin) {
		const joined = joinBegin(text);
		if (joined !== text) return formatText(joined, options, startLevel);
	}

	const lexed = lex(text);
	const plan = planIndent(lexed, startLevel);

	// ---- pass 2: spacing -------------------------------------------------
	const spaced: string[] = [];
	for (let i = 0; i < lexed.rawLines.length; i++) {
		if (plan.levels[i] === -1) {
			spaced.push(lexed.rawLines[i]);
			continue;
		}
		const kind = lexed.lineKinds[i];
		if (kind === "blank") {
			spaced.push("");
		} else if (kind === "comment" || kind === "directive") {
			spaced.push(lexed.rawLines[i].trim());
		} else {
			spaced.push(
				applySpacing(
					lexed.rawLines[i],
					lexed.protectedRanges[i] ?? [],
					opts.spaceAroundOperators,
				),
			);
		}
	}

	// ---- pass 3: alignment ----------------------------------------------
	let aligned = spaced;
	if (opts.alignPorts || opts.alignAssignments || opts.alignIfElse) {
		const relexed = lex(spaced.join("\n"));
		const commentStarts = spaced.map((line, i) => {
			const ranges = relexed.protectedRanges[i] ?? [];
			for (const [start] of ranges) {
				const head = line.slice(start, start + 2);
				if (head === "//" || head === "/*") return start;
			}
			return null;
		});
		aligned = applyAlignment({
			lines: spaced,
			commentStarts,
			tokensByLine: relexed.tokensByLine,
			alignPorts: opts.alignPorts,
			alignAssignments: opts.alignAssignments,
			alignIfElse: opts.alignIfElse,
		});
	}

	// ---- emit ------------------------------------------------------------
	const out = aligned.map((line, i) => {
		if (plan.levels[i] === -1) return lexed.rawLines[i];
		if (line === "") return "";
		return indentUnit(opts, plan.levels[i]) + line;
	});

	return out.join("\n");
}

/**
 * Indent level that applies at the start of a selection.
 * Formatting a selection without this makes every selected line jump to
 * column 0, which is the single most common bug in HDL formatters.
 */
export function computeStartLevel(textBeforeSelection: string): number {
	if (textBeforeSelection.length === 0) return 0;
	return planIndent(lex(textBeforeSelection), 0).endLevel;
}

/** Format only part of a document, preserving the surrounding indent context. */
export function formatSlice(
	fullText: string,
	sliceStartOffset: number,
	sliceEndOffset: number,
	options: Partial<FormatOptions> = {},
): string {
	const before = fullText.slice(0, sliceStartOffset);
	const slice = fullText.slice(sliceStartOffset, sliceEndOffset);
	return formatText(slice, options, computeStartLevel(before));
}
