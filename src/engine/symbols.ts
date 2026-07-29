import { lex } from "../core/lexer";
import type { LexResult } from "../core/types";

export type SymbolKind = "module" | "port" | "signal" | "parameter" | "instance";

export interface VerilogSymbol {
	name: string;
	kind: SymbolKind;
	/** e.g. "input wire [31:0]" - shown as completion detail */
	detail: string;
	line: number;
	/** 0-based column where the declared name starts */
	col: number;
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

	const add = (name: string, kind: SymbolKind, detail: string, line: number, col: number) => {
		const key = `${kind}:${name}`;
		if (seen.has(key)) return;
		seen.add(key);
		symbols.push({ name, kind, detail, line, col });
	};

	const tokens = lexed.tokens;

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];

		// module <name>
		if ((t.lower === "module" || t.lower === "macromodule") && tokens[i + 1]?.kind === "identifier") {
			add(tokens[i + 1].text, "module", "module", t.line, tokens[i + 1].col);
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
				add(n.text, kind, detail, n.line, n.col);
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

export interface ModuleOutline {
	name: string;
	/** line of the module name token */
	line: number;
	/** column of the module name token */
	col: number;
	/** line of the matching `endmodule`, or the last line if it is missing */
	endLine: number;
	members: VerilogSymbol[];
}

export interface FileOutline {
	modules: ModuleOutline[];
	/** symbols that live outside any module (e.g. stray declarations) */
	loose: VerilogSymbol[];
}

/**
 * Group the scanned symbols under their enclosing module.
 *
 * Verilog modules cannot nest, so each `module`/`macromodule` is paired with the
 * next `endmodule`. A missing `endmodule` (already reported by the linter) makes
 * the module extend to the end of the file.
 */
export function outlineFile(lexed: LexResult): FileOutline {
	const tokens = lexed.tokens;
	const lastLine = Math.max(0, lexed.maskedLines.length - 1);
	const modules: ModuleOutline[] = [];
	const open: number[] = [];

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if ((t.lower === "module" || t.lower === "macromodule") && tokens[i + 1]?.kind === "identifier") {
			const nameTok = tokens[i + 1];
			modules.push({ name: nameTok.text, line: nameTok.line, col: nameTok.col, endLine: lastLine, members: [] });
			open.push(modules.length - 1);
			i++; // skip the name token
			continue;
		}
		if (t.lower === "endmodule" && open.length > 0) {
			modules[open.pop() as number].endLine = t.line;
		}
	}

	const loose: VerilogSymbol[] = [];
	for (const s of scanSymbols(lexed)) {
		if (s.kind === "module") continue;
		const owner = modules.find((m) => s.line >= m.line && s.line <= m.endLine);
		if (owner) owner.members.push(s);
		else loose.push(s);
	}

	return { modules, loose };
}
