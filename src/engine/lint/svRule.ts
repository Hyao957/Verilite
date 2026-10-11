import type { Dialect, LexResult } from "../../core/types";
import type { LintIssue, LintRule } from "./types";

/**
 * Rules that only make sense for SystemVerilog. They are registered with a
 * `systemverilog`-only dialect list, so `.v` files never see them and the
 * Verilog golden snapshots stay byte-for-byte unchanged.
 */
const SV_ONLY: Dialect[] = ["systemverilog"];

/**
 * R4.1 - the `always_*` sensitivity-list rules.
 *
 *  - `always_comb` / `always_latch` must NOT have a sensitivity list;
 *  - `always_ff` must use an explicit edge and may never use `*`.
 *
 * Both are hard errors in the SystemVerilog grammar, not style opinions, so
 * they are always on (no option gate).
 */
function alwaysSensitivity(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	const tokens = lex.tokens;

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const w = token.lower;
		if (w !== "always_comb" && w !== "always_latch" && w !== "always_ff") continue;

		const at = tokens[i + 1];
		if (!at || at.text !== "@") continue;

		if (w === "always_comb" || w === "always_latch") {
			issues.push({
				line: at.line,
				col: at.col,
				endCol: at.endCol,
				severity: "error",
				code: "sv-always-sensitivity",
				message: `'${token.text}' \u4e0d\u5141\u8bb8\u654f\u611f\u5217\u8868\uff0c\u8bf7\u76f4\u63a5\u5199\u6267\u884c\u8bed\u53e5`,
			});
			continue;
		}

		// always_ff: reject either `@*` or a `*` inside `@(...)`.
		const wildcard = `'${token.text}' \u7684\u654f\u611f\u5217\u8868\u5fc5\u987b\u4f7f\u7528\u663e\u5f0f\u8fb9\u6cbf\uff0c\u4e0d\u80fd\u4f7f\u7528 '*'`;
		const n2 = tokens[i + 2];
		if (n2 && n2.text === "*") {
			issues.push({
				line: at.line,
				col: at.col,
				endCol: at.endCol,
				severity: "error",
				code: "sv-always-sensitivity",
				message: wildcard,
			});
		} else if (n2 && n2.text === "(") {
			let depth = 0;
			for (let j = i + 2; j < tokens.length; j++) {
				const t = tokens[j];
				if (t.text === "(") depth++;
				else if (t.text === ")") {
					depth--;
					if (depth === 0) break;
				} else if (t.text === "*" && depth === 1) {
					issues.push({
						line: at.line,
						col: at.col,
						endCol: at.endCol,
						severity: "error",
						code: "sv-always-sensitivity",
						message: wildcard,
					});
					break;
				}
			}
		}
	}

	return issues;
}

/** Opening keyword -> its end keyword, for the label check below. */
const CONTAINER_END: Record<string, string> = {
	class: "endclass",
	interface: "endinterface",
	package: "endpackage",
};

/**
 * R4.2 - `endclass : name`, `endinterface : name` and `endpackage : name` may
 * carry a label that must repeat the declared name. Only mismatches are
 * reported, so unlabelled (and therefore correct) endings stay silent.
 */
function containerLabelMismatch(lex: LexResult): LintIssue[] {
	const issues: LintIssue[] = [];
	const tokens = lex.tokens;
	const open: Array<{ end: string; name: string }> = [];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const w = token.lower;

		const endKeyword = CONTAINER_END[w];
		if (endKeyword && token.kind === "keyword") {
			const prev = tokens[i - 1]?.lower;
			if (w === "interface" && (prev === "virtual" || prev === "extern")) continue;
			if (w === "class" && (prev === "virtual" || prev === "typedef" || prev === "extern")) continue;
			const name = tokens[i + 1];
			if (name?.kind === "identifier") open.push({ end: endKeyword, name: name.text });
			continue;
		}

		if (w !== "endclass" && w !== "endinterface" && w !== "endpackage") continue;

		let frame: { end: string; name: string } | undefined;
		for (let k = open.length - 1; k >= 0; k--) {
			if (open[k].end === w) {
				frame = open.splice(k, 1)[0];
				break;
			}
		}
		if (!frame) continue;

		const colon = tokens[i + 1];
		const label = tokens[i + 2];
		if (colon?.text === ":" && label?.kind === "identifier" && label.text !== frame.name) {
			issues.push({
				line: label.line,
				col: label.col,
				endCol: label.endCol,
				severity: "error",
				code: "sv-end-label",
				message: "end \u6807\u7b7e '" + label.text + "' \u4e0e '" + frame.name + "' \u4e0d\u4e00\u81f4",
			});
		}
	}

	return issues;
}

/** The SystemVerilog-only rule set, registered by the scheduler in `index.ts`. */
export const SV_RULES: LintRule[] = [
	{ name: "sv-always-sensitivity", dialects: SV_ONLY, run: (lex) => alwaysSensitivity(lex) },
	{ name: "sv-end-label", dialects: SV_ONLY, run: (lex) => containerLabelMismatch(lex) },
];