import { lex } from "../core/lexer";
import type { LexResult } from "../core/types";

export type SymbolKind = "module" | "port" | "signal" | "parameter" | "instance";

export interface VerilogSymbol {
	name: string;
	kind: SymbolKind;
	/** e.g. "input wire [31:0]" - shown as completion detail */
	detail: string;
	line: number;
}

const NET_TYPES = new Set([
	"wire", "reg", "logic", "tri", "wand", "wor", "integer", "real", "time", "genvar", "event",
]);
const DIRECTIONS = new Set(["input", "output", "inout"]);
const PARAMS = new Set(["parameter", "localparam"]);
const MODIFIERS = new Set(["signed", "unsigned", "automatic", "var", "const"]);

/**
 * Very small single-file symbol scanner.
 *
 * It is intentionally shallow: it looks at declaration lines only and never
 * tries to build a real parse tree. That is enough for completion and is
 * cheap enough to re-run on every keystroke.
 */
export function scanSymbols(lexedOrText: LexResult | string): VerilogSymbol[] {
	const lexed = typeof lexedOrText === "string" ? lex(lexedOrText) : lexedOrText;
	const symbols: VerilogSymbol[] = [];
	const seen = new Set<string>();

	const add = (name: string, kind: SymbolKind, detail: string, line: number) => {
		const key = `${kind}:${name}`;
		if (seen.has(key)) return;
		seen.add(key);
		symbols.push({ name, kind, detail, line });
	};

	const tokens = lexed.tokens;

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];

		// module <name>
		if ((t.lower === "module" || t.lower === "macromodule") && tokens[i + 1]?.kind === "identifier") {
			add(tokens[i + 1].text, "module", "module", t.line);
			continue;
		}

		const isDirection = DIRECTIONS.has(t.lower);
		const isNet = NET_TYPES.has(t.lower);
		const isParam = PARAMS.has(t.lower);
		if (!isDirection && !isNet && !isParam) continue;

		// only treat it as a declaration when it starts a statement
		const prev = tokens[i - 1];
		if (prev && prev.kind === "identifier") continue;
		if (prev && (prev.lower === "." || prev.text === ".")) continue;

		const detailParts: string[] = [t.text];
		let j = i + 1;

		// consume type / modifier / range words
		while (j < tokens.length) {
			const n = tokens[j];
			if (NET_TYPES.has(n.lower) || MODIFIERS.has(n.lower)) {
				detailParts.push(n.text);
				j++;
				continue;
			}
			if (n.text === "[") {
				let depth = 0;
				let range = "";
				while (j < tokens.length) {
					const r = tokens[j];
					if (r.text === "[") depth++;
					range += r.text;
					if (r.text === "]") {
						depth--;
						if (depth === 0) {
							j++;
							break;
						}
					}
					j++;
				}
				detailParts.push(range);
				continue;
			}
			break;
		}

		const detail = detailParts.join(" ");
		const kind: SymbolKind = isDirection ? "port" : isParam ? "parameter" : "signal";

		// names, comma separated, until ; or ) or = 
		while (j < tokens.length) {
			const n = tokens[j];
			if (n.text === ";" || n.text === ")") break;
			if (n.kind === "identifier") {
				add(n.text, kind, detail, n.line);
				j++;
				// skip an initialiser or an array range
				while (j < tokens.length && tokens[j].text !== "," && tokens[j].text !== ";" && tokens[j].text !== ")") {
					j++;
				}
				continue;
			}
			if (n.text === ",") {
				j++;
				continue;
			}
			break;
		}

		i = Math.max(i, j - 1);
	}

	return symbols;
}

/** Name of the first module declared in the document, if any. */
export function firstModuleName(lexed: LexResult): string | null {
	const tokens = lexed.tokens;
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].lower === "module" && tokens[i + 1]?.kind === "identifier") {
			return tokens[i + 1].text;
		}
	}
	return null;
}
