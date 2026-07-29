import { lex } from "../../core/lexer";
import { applyAlignment } from "./align";
import { planIndent } from "./indent";
import { applySpacing } from "./spacing";
import { DEFAULT_FORMAT_OPTIONS, indentUnit } from "./types";
import type { FormatOptions } from "./types";

export type { FormatOptions } from "./types";
export { DEFAULT_FORMAT_OPTIONS } from "./types";
export { planIndent } from "./indent";

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
	if (opts.alignPorts || opts.alignAssignments) {
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
			alignPorts: opts.alignPorts,
			alignAssignments: opts.alignAssignments,
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
