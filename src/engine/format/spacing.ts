import type { ColRange } from "../../core/types";

/**
 * Binary operators that get exactly one space on each side.
 *
 * Deliberately absent: `:` `?` `+` `-` `*` `/` `<` `>` `&` `|` `^` `~`.
 * Those are ambiguous in Verilog (bit-selects `[7:0]`, case labels `2'b00:`,
 * ternaries, unary signs, reduction operators, attributes `(* ... *)`), so
 * touching them causes far more damage than it fixes.
 */
const OPERATOR_RE = /\s*(===|!==|==\?|!=\?|<->|=>|\*>|==|!=|<=|>=|<<<|>>>|<<|>>|&&|\|\||=)\s*/g;

const KEYWORD_PAREN_RE = /\b(if|case|casex|casez|while|for|repeat|always|initial)\(/g;

interface Segment {
	text: string;
	guarded: boolean;
}

function split(raw: string, ranges: ColRange[]): Segment[] {
	const segments: Segment[] = [];
	let pos = 0;
	for (const [start, end] of ranges) {
		const s = Math.max(pos, start);
		const e = Math.min(raw.length, end);
		if (s > pos) segments.push({ text: raw.slice(pos, s), guarded: false });
		if (e > s) segments.push({ text: raw.slice(s, e), guarded: true });
		pos = Math.max(pos, e);
	}
	if (pos < raw.length) segments.push({ text: raw.slice(pos), guarded: false });
	return segments;
}

function normalizeCode(text: string, spaceAroundOperators: boolean): string {
	let out = text;
	if (spaceAroundOperators) {
		out = out.replace(OPERATOR_RE, " $1 ");
	}
	out = out.replace(/\s*,[ \t]*/g, ", ");
	out = out.replace(/[ \t]+;/g, ";");
	out = out.replace(/;(?=[^\s;])/g, "; ");
	out = out.replace(KEYWORD_PAREN_RE, "$1 (");
	// `always@(` -> `always @(`. The `@` is unambiguous (sensitivity / event),
	// unlike the operators we deliberately leave alone.
	out = out.replace(/\b(always|always_ff|always_comb|always_latch)\b[ \t]*@/g, "$1 @");
	out = out.replace(/[ \t]{2,}/g, " ");
	return out;
}

/**
 * Pass 2 of the formatter: normalise spacing inside code, never inside a
 * comment or a string literal.
 *
 * @param raw            the original line text
 * @param ranges         protected (comment / string) column ranges for this line
 */
export function applySpacing(
	raw: string,
	ranges: ColRange[],
	spaceAroundOperators: boolean,
): string {
	const segments = split(raw, ranges);
	let out = "";

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (seg.guarded) {
			// keep at least one space between code and a trailing comment
			if (out.length > 0 && !/\s$/.test(out)) out += " ";
			out += seg.text;
			continue;
		}
		let piece = normalizeCode(seg.text, spaceAroundOperators);
		if (i === 0) piece = piece.replace(/^[ \t]+/, "");
		out += piece;
	}

	return out.replace(/[ \t]+$/, "");
}
