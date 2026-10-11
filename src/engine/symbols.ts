import { lex } from "../core/lexer";
import type { Dialect, LexResult, Token } from "../core/types";

export type SymbolKind =
	| "module"
	| "port"
	| "signal"
	| "parameter"
	| "instance"
	| "type"
	| "method"
	| "interface"
	| "modport"
	| "package"
	| "program"
	| "enumMember";

export interface VerilogSymbol {
	name: string;
	kind: SymbolKind;
	/** e.g. "input wire [31:0]" - shown as completion detail */
	detail: string;
	line: number;
	/** 0-based column where the declared name starts */
	col: number;
}

const VERILOG_NET_TYPES = new Set([
	"wire", "reg", "tri", "wand", "wor", "integer", "real", "time", "genvar", "event",
]);
const SYSTEMVERILOG_NET_TYPES = new Set([
        ...VERILOG_NET_TYPES,
	"logic", "bit", "byte", "shortint", "int", "longint", "shortreal", "realtime",
        "string", "chandle", "mailbox", "semaphore", "process",
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
export function scanSymbols(lexedOrText: LexResult | string, dialect: Dialect = "verilog"): VerilogSymbol[] {
	const lexed = typeof lexedOrText === "string" ? lex(lexedOrText, dialect) : lexedOrText;
	const symbols: VerilogSymbol[] = [];
	const seen = new Set<string>();
        const declarationTypes = new Set(
                dialect === "systemverilog" ? SYSTEMVERILOG_NET_TYPES : VERILOG_NET_TYPES,
        );

	const add = (name: string, kind: SymbolKind, detail: string, line: number, col: number) => {
		const key = `${kind}:${name}`;
		if (seen.has(key)) return;
		seen.add(key);
		symbols.push({ name, kind, detail, line, col });
	};

	const tokens = lexed.tokens;

	// Enum members are declarations too: `IDLE` in
	// `typedef enum { IDLE, RUN } state_t;` must be completable on its own, and
	// `state_t::` must be able to list the members.
	if (dialect === "systemverilog") {
		for (const decl of collectEnums(tokens)) {
			const detail = decl.typeName ? decl.typeName.text : "enum";
			for (const member of decl.members) {
				add(member.text, "enumMember", detail, member.line, member.col);
			}
		}
	}

	// Discover user-defined types before scanning variable declarations. A
	// typedef may contain member semicolons inside a struct/union body, so only
	// a semicolon at brace depth zero terminates it.
        if (dialect === "systemverilog") {
                for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const next = tokens[i + 1];
			const prev = tokens[i - 1];

			// class <Name> [extends <Base>]
			if (token.lower === "class" && next?.kind === "identifier") {
				declarationTypes.add(next.lower);
				const detail =
					tokens[i + 2]?.lower === "extends" && tokens[i + 3]?.kind === "identifier"
						? `class extends ${tokens[i + 3].text}`
						: "class";
				add(next.text, "type", detail, next.line, next.col);
			}

			// interface <Name> (ignores `virtual interface if_t vif;` references)
			if (
				token.lower === "interface" &&
				next?.kind === "identifier" &&
				prev?.lower !== "virtual" &&
				prev?.lower !== "extern"
			) {
				declarationTypes.add(next.lower);
				add(next.text, "interface", "interface", next.line, next.col);
			}

			// modport <Name>
			if (token.lower === "modport" && next?.kind === "identifier") {
				add(next.text, "modport", "modport", next.line, next.col);
			}

			// package <Name> / program <Name>
			if (
				(token.lower === "package" || token.lower === "program") &&
				next?.kind === "identifier"
			) {
				const kind: SymbolKind = token.lower === "package" ? "package" : "program";
				add(next.text, kind, token.lower, next.line, next.col);
			}

			// function / task ... <Name>  -> class or module subprogram
			if (token.lower === "function" || token.lower === "task") {
				const name = subprogramName(tokens, i);
				if (name) add(name.text, "method", token.lower, name.line, name.col);
			}

			if (token.lower !== "typedef") continue;

			let braceDepth = 0;
			let typeName: Token | undefined;
			for (let j = i + 1; j < tokens.length; j++) {
				const candidate = tokens[j];
				if (candidate.text === "{") {
					braceDepth++;
					continue;
				}
				if (candidate.text === "}") {
					braceDepth = Math.max(0, braceDepth - 1);
					continue;
				}
				if (candidate.text === ";" && braceDepth === 0) break;
				if (braceDepth === 0 && candidate.kind === "identifier") typeName = candidate;
                        }
                        if (typeName) {
                                declarationTypes.add(typeName.lower);
                                add(typeName.text, "type", "typedef", typeName.line, typeName.col);
                        }
                }
        }

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];

		// module <name>
		if ((t.lower === "module" || t.lower === "macromodule") && tokens[i + 1]?.kind === "identifier") {
			add(tokens[i + 1].text, "module", "module", t.line, tokens[i + 1].col);
			continue;
		}

		const isDirection = DIRECTIONS.has(t.lower);
                const isNet = declarationTypes.has(t.lower);
		const isParam = PARAMS.has(t.lower);
		// A user type used with a package scope, e.g. `pkg::type_t x;`.
		const isScoped =
			!isDirection &&
			!isNet &&
			!isParam &&
			t.kind === "identifier" &&
			isScopeSep(tokens, i + 1);
		if (!isDirection && !isNet && !isParam && !isScoped) continue;

		// only treat it as a declaration when it starts a statement
		const prev = tokens[i - 1];
		if (prev && prev.kind === "identifier") continue;
		if (prev && (prev.lower === "." || prev.text === ".")) continue;
		if (prev && prev.text === ":" && tokens[i - 2]?.text === ":") continue;

		// A declaration starts with a type: a built-in or direction/parameter
		// keyword, or a (possibly package-qualified) user type.
		let j = i;
		let typeName = tokens[j].text;
		j++;
		while (isScopeSep(tokens, j) && tokens[j + 2]?.kind === "identifier") {
			typeName += "::" + tokens[j + 2].text;
			j += 3;
		}

		const detailParts: string[] = [typeName];

		// consume parameter arguments / modifier / range words
		while (j < tokens.length) {
			const n = tokens[j];
                        if (declarationTypes.has(n.lower) || MODIFIERS.has(n.lower)) {
				detailParts.push(n.text);
				j++;
				continue;
			}
			if (n.text === "#" && tokens[j + 1]?.text === "(") {
				let argDepth = 0;
				let args = "";
				let k = j;
				while (k < tokens.length) {
					const a = tokens[k];
					if (a.text === "(") argDepth++;
					args += a.text;
					if (a.text === ")") {
						argDepth--;
						if (argDepth === 0) {
							k++;
							break;
						}
					}
					k++;
				}
				if (argDepth === 0) {
					detailParts.push(args);
					j = k;
					continue;
				}
				break;
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

/**
 * True when `tokens[k]` and `tokens[k + 1]` form the `::` scope separator. The
 * lexer emits it as two separate `:` operator tokens.
 */
function isScopeSep(tokens: Token[], k: number): boolean {
	return tokens[k]?.text === ":" && tokens[k + 1]?.text === ":";
}

/**
 * Name token of the subprogram introduced by a `function` / `task` keyword at
 * `start`: the last identifier (or the `new` constructor) before the argument
 * list or the terminating `;`.
 */
function subprogramName(tokens: Token[], start: number): Token | undefined {
	let candidate: Token | undefined;
	let depth = 0;
	for (let j = start + 1; j < tokens.length; j++) {
		const t = tokens[j];
		if (t.text === "(") {
			depth++;
			if (depth === 1 && candidate) return candidate;
			continue;
		}
		if (t.text === ")") {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (t.text === ";" && depth === 0) return candidate;
		if (depth === 0 && (t.kind === "identifier" || t.lower === "new")) candidate = t;
	}
	return undefined;
}

interface EnumDecl {
	/** the type name that follows the member list, when the enum is named */
	typeName?: Token;
	/** the member name tokens, in source order */
	members: Token[];
}

/**
 * Every `enum { ... }` member list together with the type name that follows it.
 * Member initialisers (`RUN = 2'b01`) and nested concatenations are skipped, so
 * only the member identifiers themselves are returned.
 */
function collectEnums(tokens: Token[]): EnumDecl[] {
	const out: EnumDecl[] = [];
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].lower !== "enum") continue;

		// the member list opens at the next `{`; `enum int x;` has none
		let brace = -1;
		for (let j = i + 1; j < tokens.length; j++) {
			if (tokens[j].text === "{") {
				brace = j;
				break;
			}
			if (tokens[j].text === ";" || tokens[j].text === "}") break;
		}
		if (brace < 0) continue;

		let depth = 0;
		let close = -1;
		for (let j = brace; j < tokens.length; j++) {
			if (tokens[j].text === "{") depth++;
			else if (tokens[j].text === "}") {
				depth--;
				if (depth === 0) {
					close = j;
					break;
				}
			}
		}
		if (close < 0) continue;

		// split the body on top-level commas; each segment's first identifier is
		// the member name (an `=` initialiser may follow it)
		const members: Token[] = [];
		let segStart = brace + 1;
		let inner = 0;
		const flush = (end: number) => {
			for (let k = segStart; k < end; k++) {
				if (tokens[k].kind === "identifier") {
					members.push(tokens[k]);
					return;
				}
				if (tokens[k].text === "=") return;
			}
		};
		for (let k = brace + 1; k < close; k++) {
			const t = tokens[k];
			if (t.text === "(" || t.text === "[" || t.text === "{") inner++;
			else if (t.text === ")" || t.text === "]" || t.text === "}") inner--;
			else if (t.text === "," && inner === 0) {
				flush(k);
				segStart = k + 1;
			}
		}
		flush(close);

		let typeName: Token | undefined;
		for (let k = close + 1; k < tokens.length; k++) {
			if (tokens[k].text === ";") break;
			if (tokens[k].kind === "identifier") {
				typeName = tokens[k];
				break;
			}
		}

		out.push({ typeName, members });
		i = close;
	}
	return out;
}

/**
 * Enum type name -> its members, used for `state_t::` completion. Only the
 * SystemVerilog dialect has enums, so Verilog always returns an empty map.
 */
export function enumMemberSymbols(
	lexed: LexResult,
	dialect: Dialect = "verilog",
): Map<string, VerilogSymbol[]> {
	const map = new Map<string, VerilogSymbol[]>();
	if (dialect !== "systemverilog") return map;
	for (const decl of collectEnums(lexed.tokens)) {
		if (!decl.typeName) continue;
		const typeName = decl.typeName.text;
		map.set(
			typeName,
			decl.members.map((m) => ({
				name: m.text,
				kind: "enumMember" as SymbolKind,
				detail: typeName,
				line: m.line,
				col: m.col,
			})),
		);
	}
	return map;
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

/**
 * One node of the document outline: either a container (module, class,
 * interface, package or program) or a plain declaration used as a leaf.
 */
export interface OutlineNode {
	name: string;
	kind: SymbolKind;
	detail: string;
	/** line of the declared name */
	line: number;
	/** column of the declared name */
	col: number;
	/** line of the matching end keyword, or the last line when it is missing; equals `line` for leaves */
	endLine: number;
	/** nested declarations, in source order; empty for leaves */
	children: OutlineNode[];
}

export interface FileOutline {
	/** every top-level node (containers and stray declarations), in source order */
	roots: OutlineNode[];
}

/** Opening keyword -> closing keyword of the containers that can nest. */
const CONTAINER_ENDS: Record<string, string> = {
	module: "endmodule",
	macromodule: "endmodule",
	class: "endclass",
	interface: "endinterface",
	package: "endpackage",
	program: "endprogram",
};

/** Closing keyword -> the {@link SymbolKind} of the container it closes. */
const END_KEYWORD_KIND: Record<string, SymbolKind> = {
	endmodule: "module",
	endclass: "type",
	endinterface: "interface",
	endpackage: "package",
	endprogram: "program",
};

/** Containers that only exist in SystemVerilog. */
const SV_ONLY_CONTAINERS = new Set(["class", "interface", "package", "program"]);

interface ContainerStart {
	name: string;
	kind: SymbolKind;
	detail: string;
	line: number;
	col: number;
}

/**
 * Describe the container opened by the keyword at `i`, or `undefined` when the
 * token does not start a real container.
 */
function containerStart(tokens: Token[], i: number, dialect: Dialect): ContainerStart | undefined {
	const t = tokens[i];
	if (!CONTAINER_ENDS[t.lower]) return undefined;
	if (SV_ONLY_CONTAINERS.has(t.lower) && dialect !== "systemverilog") return undefined;

	const name = tokens[i + 1];
	if (!name || name.kind !== "identifier") return undefined;

	// `virtual interface if_t vif;` and `extern`/`typedef class C;` are references
	// or forward declarations, not containers.
	const prev = tokens[i - 1];
	if (t.lower === "interface" && (prev?.lower === "virtual" || prev?.lower === "extern")) return undefined;
	if (t.lower === "class" && (prev?.lower === "typedef" || prev?.lower === "extern")) return undefined;

	let detail = t.lower;
	if (t.lower === "class" && tokens[i + 2]?.lower === "extends" && tokens[i + 3]?.kind === "identifier") {
		detail = `class extends ${tokens[i + 3].text}`;
	}
	return { name: name.text, kind: t.lower === "class" ? "type" : t.lower === "macromodule" ? "module" : (t.lower as SymbolKind), detail, line: name.line, col: name.col };
}

/** Innermost container that spans `line`, ignoring `self`; the smallest span wins. */
function innermostContainer(
	containers: OutlineNode[],
	line: number,
	self: OutlineNode,
): OutlineNode | undefined {
	let best: OutlineNode | undefined;
	for (const c of containers) {
		if (c === self) continue;
		if (line < c.line || line > c.endLine) continue;
		if (!best || c.endLine - c.line < best.endLine - best.line) best = c;
	}
	return best;
}

/**
 * Build the document outline as a tree.
 *
 * Verilog modules cannot nest, but SystemVerilog containers can (a package may
 * hold classes, an interface may hold modports, and so on). Every
 * `module`/`class`/`interface`/`package`/`program` is paired with its matching
 * end keyword and becomes a parent node; the declarations that fall inside it
 * become its children. A missing end keyword (already reported by the linter)
 * makes the container extend to the end of the file.
 */
export function outlineFile(lexed: LexResult, dialect: Dialect = "verilog"): FileOutline {
	const tokens = lexed.tokens;
	const lastLine = Math.max(0, lexed.maskedLines.length - 1);

	const containers: OutlineNode[] = [];
	const open: number[] = [];

	for (let i = 0; i < tokens.length; i++) {
		const start = containerStart(tokens, i, dialect);
		if (start) {
			containers.push({ ...start, endLine: lastLine, children: [] });
			open.push(containers.length - 1);
			i++; // skip the name token
			continue;
		}
		const endKind = END_KEYWORD_KIND[tokens[i].lower];
		if (endKind) {
			for (let k = open.length - 1; k >= 0; k--) {
				if (containers[open[k]].kind === endKind) {
					containers[open[k]].endLine = tokens[i].line;
					open.splice(k, 1);
					break;
				}
			}
		}
	}

	// Symbols that were already emitted as containers must not be nested again.
	const containerKeys = new Set(containers.map((c) => `${c.kind}:${c.name}`));

	const roots: OutlineNode[] = [];
	const attach = (node: OutlineNode): void => {
		const parent = innermostContainer(containers, node.line, node);
		if (parent) parent.children.push(node);
		else roots.push(node);
	};

	for (const c of containers) attach(c);
	for (const s of scanSymbols(lexed, dialect)) {
		if (containerKeys.has(`${s.kind}:${s.name}`)) continue;
		attach({ name: s.name, kind: s.kind, detail: s.detail, line: s.line, col: s.col, endLine: s.line, children: [] });
	}

	for (const c of containers) c.children.sort((a, b) => a.line - b.line || a.col - b.col);
	roots.sort((a, b) => a.line - b.line || a.col - b.col);
	return { roots };
}
