/**
 * Pass 3 of the formatter: column alignment.
 *
 * Only consecutive runs of the same kind of line are aligned; any other line
 * breaks the run. That keeps the transformation local, predictable, and
 * idempotent.
 */

import type { Dialect, Token } from "../../core/types";

const ASSIGN_RE =
	/^(assign\s+[A-Za-z_][\w$]*(?:\s*\[[^\]]*\])?)\s*=\s*(.*)$/;

/**
 * A `parameter` / `localparam` initialisation, e.g. `localparam S_IDLE = 16'h0001;`.
 * The left-hand side is everything up to the first `=` (keyword, optional type /
 * range and name); the right-hand side is the value, trailing `;` included.
 */
const PARAM_ASSIGN_RE = /^((?:localparam|parameter)\b[^=]+?)\s*=\s*(.+)$/;

/** A module instance port connection, e.g. `.clk_out1 (clk_100m),`. */
const INSTANCE_PORT_RE = /^(\.\w+\s*)(\(.+\))(\s*,?\s*)$/;

// ---------------------------------------------------------------------------
// Declaration patterns, kept per dialect. The Verilog set is frozen: changing
// it would alter the Verilog golden snapshots, so the SystemVerilog set only
// *adds* the extra data types and declaration qualifiers.
// ---------------------------------------------------------------------------

/** Net / variable types shared by both dialects. */
const VERILOG_TYPES = "wire|reg|logic|tri|wand|wor";

/**
 * The net / variable types of the (frozen) Verilog declaration pattern. It
 * already carries the SystemVerilog integer types because it predates the
 * dialect split; do not remove them or the goldens move.
 */
const VERILOG_DECL_TYPES =
	"wire|reg|logic|bit|byte|shortint|integer|int|longint|tri|triand|trior|trireg|tri0|tri1|wand|wor|uwire|supply0|supply1";

/** SystemVerilog adds the remaining built-in data types. */
const SV_DECL_TYPES = `${VERILOG_DECL_TYPES}|time|string|real|shortreal`;

/** SystemVerilog declaration qualifiers, e.g. `rand`, `local`, `static`. */
const SV_QUALIFIERS = "(?:(?:rand|randc|local|protected|static|automatic|const)\\s+)*";

interface AlignPatterns {
	/** direction-based port declaration, e.g. `input wire [7:0] data,` */
	port: RegExp;
	/** single-name net / variable declaration, e.g. `wire [127:0] data;` */
	decl: RegExp;
	/** single-name declaration with initialisation, e.g. `wire [4:0] x = 5'd2;` */
	declAssign: RegExp;
}

/**
 * A single-name net / variable declaration. This is a port declaration without
 * the direction, so it parses into the same PortParts shape with an empty `dir`.
 * Multi-name lines (`logic a, b;`) and initialised declarations
 * (`logic clk = 1'b0;`) deliberately do NOT match, so they break an alignment
 * run rather than being reflowed.
 */
const VERILOG_PATTERNS: AlignPatterns = {
	port: new RegExp(
		`^(input|output|inout)\\s+(?:(${VERILOG_TYPES})\\s+)?(?:(signed|unsigned)\\s+)?(?:(\\[[^\\]]*\\])\\s*)?([A-Za-z_]\\w*)\\s*(,?)$`,
	),
	decl: new RegExp(
		`^(${VERILOG_DECL_TYPES})\\s+(?:(signed|unsigned)\\s+)?(?:(\\[[^\\]]*\\])\\s*)?([A-Za-z_]\\w*)\\s*([;,])\\s*$`,
	),
	declAssign: new RegExp(
		`^(${VERILOG_DECL_TYPES})\\s+(?:(signed|unsigned)\\s+)?(?:(\\[[^\\]]*\\])\\s*)?([A-Za-z_]\\w*)\\s*=\\s*(.+)$`,
	),
};

const SYSTEMVERILOG_PATTERNS: AlignPatterns = {
	// `input var logic [7:0] x` - the `var` qualifier is folded into the type
	// field so it stays in the same alignment column.
	port: new RegExp(
		`^(input|output|inout)\\s+(?:((?:var\\s+)?(?:${SV_DECL_TYPES}))\\s+)?(?:(signed|unsigned)\\s+)?(?:(\\[[^\\]]*\\])\\s*)?([A-Za-z_]\\w*)\\s*(,?)$`,
	),
	decl: new RegExp(
		`^(${SV_QUALIFIERS}(?:${SV_DECL_TYPES}))\\s+(?:(signed|unsigned)\\s+)?(?:(\\[[^\\]]*\\])\\s*)?([A-Za-z_]\\w*)\\s*([;,])\\s*$`,
	),
	declAssign: new RegExp(
		`^(${SV_QUALIFIERS}(?:${SV_DECL_TYPES}))\\s+(?:(signed|unsigned)\\s+)?(?:(\\[[^\\]]*\\])\\s*)?([A-Za-z_]\\w*)\\s*=\\s*(.+)$`,
	),
};

function patternsFor(dialect: Dialect): AlignPatterns {
	return dialect === "systemverilog" ? SYSTEMVERILOG_PATTERNS : VERILOG_PATTERNS;
}

/** A procedural assignment, e.g. `a <= b;` or `cnt = cnt + 1;`. */
const BLOCK_ASSIGN_RE = /^([A-Za-z_]\w*(?:\s*\[[^\]]*\])?)\s*(<=|=)\s*(.+);\s*$/;

interface Split {
	code: string;
	comment: string;
}

/** Separate a trailing line comment using the protected ranges of that line. */
function splitComment(text: string, commentStart: number | null): Split {
	if (commentStart === null || commentStart >= text.length) {
		return { code: text.trimEnd(), comment: "" };
	}
	return {
		code: text.slice(0, commentStart).trimEnd(),
		comment: text.slice(commentStart).trimEnd(),
	};
}

interface PortParts {
	dir: string;
	type: string;
	sign: string;
	msb: string;
	lsb: string;
	single: string;
	name: string;
	comma: string;
	comment: string;
}

function parsePort(code: string, comment: string, re: RegExp): PortParts | null {
	const m = re.exec(code);
	if (!m) return null;
	const range = m[4] ?? "";
	let msb = "";
	let lsb = "";
	let single = "";
	if (range) {
		const inner = range.slice(1, -1);
		const idx = inner.indexOf(":");
		if (idx >= 0) {
			msb = inner.slice(0, idx).trim();
			lsb = inner.slice(idx + 1).trim();
		} else {
			single = inner.trim();
		}
	}
	return {
		dir: m[1],
		type: m[2] ?? "",
		sign: m[3] ?? "",
		msb,
		lsb,
		single,
		name: m[5],
		comma: m[6] ?? "",
		comment,
	};
}

/**
 * Parse a single-name net / variable declaration into the same shape as a port,
 * with an empty direction. Returns null for anything else (multi-name lines,
 * initialised declarations, ...), which is what breaks an alignment run.
 */
function parseDecl(code: string, comment: string, re: RegExp): PortParts | null {
	const m = re.exec(code);
	if (!m) return null;
	const range = m[3] ?? "";
	let msb = "";
	let lsb = "";
	let single = "";
	if (range) {
		const inner = range.slice(1, -1);
		const idx = inner.indexOf(":");
		if (idx >= 0) {
			msb = inner.slice(0, idx).trim();
			lsb = inner.slice(idx + 1).trim();
		} else {
			single = inner.trim();
		}
	}
	return {
		dir: "",
		type: m[1],
		sign: m[2] ?? "",
		msb,
		lsb,
		single,
		name: m[4],
		comma: m[5] ?? "",
		comment,
	};
}

interface DeclAssignParts {
	type: string;
	sign: string;
	msb: string;
	lsb: string;
	single: string;
	name: string;
	rhs: string;
	comment: string;
}

function parseDeclAssign(code: string, comment: string, re: RegExp): DeclAssignParts | null {
	const m = re.exec(code);
	if (!m) return null;
	const range = m[3] ?? "";
	let msb = "";
	let lsb = "";
	let single = "";
	if (range) {
		const inner = range.slice(1, -1);
		const idx = inner.indexOf(":");
		if (idx >= 0) {
			msb = inner.slice(0, idx).trim();
			lsb = inner.slice(idx + 1).trim();
		} else {
			single = inner.trim();
		}
	}
	return {
		type: m[1],
		sign: m[2] ?? "",
		msb,
		lsb,
		single,
		name: m[4],
		rhs: m[5],
		comment,
	};
}

interface InstancePortParts {
	port: string;   // ".clk_out1"
	value: string;  // "(clk_100m)" with parens
	comma: string;  // "," or ""
	comment: string;
}

function parseInstancePort(code: string, comment: string): InstancePortParts | null {
	const m = INSTANCE_PORT_RE.exec(code);
	if (!m) return null;
	return {
		port: m[1],
		value: m[2],
		comma: m[3].trim(),
		comment,
	};
}

interface BlockAssignParts {
	lhs: string;   // "long_signal" or "data[7:0]"
	op: string;    // "<=" or "="
	rhs: string;   // "c + d;" (includes trailing semicolon)
	comment: string;
}

function parseBlockAssign(code: string, comment: string): BlockAssignParts | null {
	const m = BLOCK_ASSIGN_RE.exec(code);
	if (!m) return null;
	return {
		lhs: m[1],
		op: m[2],
		rhs: m[3] + ";",
		comment,
	};
}

function renderBlockAssignGroup(group: BlockAssignParts[]): string[] {
	const lhsW = Math.max(...group.map((p) => p.lhs.length));
	const opW = Math.max(...group.map((p) => p.op.length));
	const rhsW = Math.max(...group.map((p) => p.rhs.length));

	const codes = group.map((p) => {
		const s = `${p.lhs.padEnd(lhsW)} ${p.op.padEnd(opW)} ${p.rhs.padEnd(rhsW)}`;
		return s.replace(/[ \t]+$/, "");
	});

	const hasComment = group.some((p) => p.comment.length > 0);
	if (!hasComment) return codes;

	const codeW = Math.max(...codes.map((c) => c.length));
	return codes.map((c, i) =>
		group[i].comment ? `${c.padEnd(codeW)}  ${group[i].comment}` : c,
	);
}

function renderDeclAssignGroup(group: DeclAssignParts[]): string[] {
	const typeW = Math.max(...group.map((p) => p.type.length));
	const signW = Math.max(...group.map((p) => p.sign.length));
	const msbW = Math.max(0, ...group.map((p) => p.msb.length));
	const lsbW = Math.max(0, ...group.map((p) => p.lsb.length));

	const renderRange = (p: DeclAssignParts): string => {
		if (p.msb || p.lsb) {
			return `[${p.msb.padStart(msbW)}:${p.lsb.padEnd(lsbW)}]`;
		}
		if (p.single) return `[${p.single}]`;
		return "";
	};

	const rangeStrings = group.map(renderRange);
	const rangeW = Math.max(0, ...rangeStrings.map((s) => s.length));

	// build left-hand side: type + sign + range + name
	const leftParts = group.map((p, i) => {
		const fields: string[] = [];
		if (typeW > 0) fields.push(p.type.padEnd(typeW));
		if (signW > 0) fields.push(p.sign.padEnd(signW));
		if (rangeW > 0) fields.push(rangeStrings[i].padEnd(rangeW));
		const head = fields.join(" ");
		return (head ? head + " " : "") + p.name;
	});

	const nameW = Math.max(...leftParts.map((s) => s.length));
	const rhsW = Math.max(...group.map((p) => p.rhs.length));

	const codes = group.map((_, i) => {
		const s = `${leftParts[i].padEnd(nameW)} = ${group[i].rhs.padEnd(rhsW)}`;
		return s.replace(/[ \t]+$/, "");
	});

	const hasComment = group.some((p) => p.comment.length > 0);
	if (!hasComment) return codes;

	const codeW = Math.max(...codes.map((c) => c.length));
	return codes.map((c, i) =>
		group[i].comment ? `${c.padEnd(codeW)}  ${group[i].comment}` : c,
	);
}

function renderInstancePortGroup(group: InstancePortParts[]): string[] {
	// align port names (right-padded)
	const portW = Math.max(...group.map((p) => p.port.length));

	// split value into ( + inner + )
	const innerParts = group.map((p) => {
		const v = p.value;
		const inner = v.slice(1, -1).trim(); // strip '(' and ')'
		return { open: "(", inner, close: ")" };
	});
	const innerW = Math.max(...innerParts.map((p) => p.inner.length));
	const commaW = Math.max(...group.map((p) => p.comma.length));

	const codes = group.map((p, i) => {
		const ip = innerParts[i];
		const s = `${p.port.padEnd(portW)}${ip.open}${ip.inner.padEnd(innerW)}${ip.close}${p.comma.padEnd(commaW)}`;
		return s.replace(/[ \t]+$/, "");
	});

	const hasComment = group.some((p) => p.comment.length > 0);
	if (!hasComment) return codes;

	const codeW = Math.max(...codes.map((c) => c.length));
	return codes.map((c, i) =>
		group[i].comment ? `${c.padEnd(codeW)}  ${group[i].comment}` : c,
	);
}

function renderPortGroup(group: PortParts[]): string[] {
	const dirW = Math.max(...group.map((p) => p.dir.length));
	const typeW = Math.max(...group.map((p) => p.type.length));
	const signW = Math.max(...group.map((p) => p.sign.length));
	const msbW = Math.max(0, ...group.map((p) => p.msb.length));
	const lsbW = Math.max(0, ...group.map((p) => p.lsb.length));

	const renderRange = (p: PortParts): string => {
		if (p.msb || p.lsb) {
			return `[${p.msb.padStart(msbW)}:${p.lsb.padEnd(lsbW)}]`;
		}
		if (p.single) return `[${p.single}]`;
		return "";
	};

	const rangeStrings = group.map(renderRange);
	const rangeW = Math.max(0, ...rangeStrings.map((s) => s.length));

	const codes = group.map((p, i) => {
		const fields: string[] = [];
		if (dirW > 0) fields.push(p.dir.padEnd(dirW));
		if (typeW > 0) fields.push(p.type.padEnd(typeW));
		if (signW > 0) fields.push(p.sign.padEnd(signW));
		if (rangeW > 0) fields.push(rangeStrings[i].padEnd(rangeW));
		const head = fields.join(" ");
		const s = (head ? head + " " : "") + p.name + p.comma;
		return s.replace(/[ \t]+$/, "");
	});

	const hasComment = group.some((p) => p.comment.length > 0);
	if (!hasComment) return codes;

	const codeW = Math.max(...codes.map((c) => c.length));
	return codes.map((c, i) =>
		group[i].comment ? `${c.padEnd(codeW)}  ${group[i].comment}` : c,
	);
}

function renderAssignGroup(rows: Array<{ lhs: string; rhs: string; comment: string }>): string[] {
	const lhsW = Math.max(...rows.map((r) => r.lhs.length));
	return rows.map((r) => {
		const code = `${r.lhs.padEnd(lhsW)} = ${r.rhs}`.replace(/[ \t]+$/, "");
		return r.comment ? `${code}  ${r.comment}` : code;
	});
}

interface IfElseParts {
	/** everything before the body, e.g. `else if (key_en)` */
	prefix: string;
	/** the single-statement body, e.g. `lfsr_s1 <= {k1, k2};` */
	body: string;
	comment: string;
}

/**
 * Parse a single-statement `if` / `else if` / `else` line (condition and body on
 * one line, no `begin`/`end`) into its condition prefix and body. Returns null
 * for anything else - which is exactly what keeps `begin`/`end` branches out of
 * an alignment run, so they keep the normal indentation.
 */
function parseIfElse(code: string, tokens: Token[], comment: string): IfElseParts | null {
	if (tokens.length === 0) return null;

	let idx: number;
	if (tokens[0].lower === "if") idx = 1;
	else if (tokens[0].lower === "else") idx = tokens[1]?.lower === "if" ? 2 : 1;
	else return null;

	let bodyStart: number | undefined;
	if (tokens[idx - 1].lower === "if") {
		if (tokens[idx]?.text !== "(") return null;
		let depth = 0;
		let k = idx;
		for (; k < tokens.length; k++) {
			if (tokens[k].text === "(") depth++;
			else if (tokens[k].text === ")") {
				depth--;
				if (depth === 0) {
					k++;
					break;
				}
			}
		}
		if (depth !== 0) return null;
		bodyStart = tokens[k]?.col;
	} else {
		bodyStart = tokens[idx]?.col; // bare `else`
	}
	if (bodyStart === undefined) return null;

	const last = tokens[tokens.length - 1];
	if (last.text !== ";") return null; // not one complete statement on the line
	if (tokens.some((t) => t.lower === "begin" || t.lower === "fork")) return null;

	const prefix = code.slice(0, bodyStart).replace(/\s+$/, "");
	const body = code.slice(bodyStart).replace(/\s+$/, "");
	if (!prefix || !body) return null;
	return { prefix, body, comment };
}

export interface AlignInput {
	/** dialect of the text; selects the declaration pattern set */
	dialect?: Dialect;
	/** already trimmed + spaced code lines */
	lines: string[];
	/** for each line: column where the trailing comment starts, or null */
	commentStarts: Array<number | null>;
	/** tokens per line of the spaced text; required for alignIfElse */
	tokensByLine?: Token[][];
	alignPorts: boolean;
	alignAssignments: boolean;
	alignIfElse?: boolean;
	/** column-align consecutive net / variable declarations (`wire`/`reg`/`logic`/...) */
	alignDeclarations?: boolean;
	/** column-align the '=' of consecutive `parameter` / `localparam` initialisations */
	alignParams?: boolean;
	/** column-align the '=' of consecutive initialized declarations (wire/reg/logic with =) */
	alignDeclAssignments?: boolean;
	/** column-align .port_name(value) connections in module instantiations */
	alignInstancePorts?: boolean;
	/** column-align consecutive assignments (<= / =) inside procedural blocks */
	alignBlockAssignments?: boolean;
}

export function applyAlignment(input: AlignInput): string[] {
	const {
		dialect = "verilog",
		lines,
		commentStarts,
		tokensByLine = [],
		alignPorts,
		alignAssignments,
		alignIfElse = false,
		alignDeclarations = false,
		alignParams = false,
		alignDeclAssignments = false,
		alignInstancePorts = false,
		alignBlockAssignments = false,
	} = input;
	const patterns = patternsFor(dialect);
	const out = lines.slice();

	if (alignPorts) {
		let i = 0;
		while (i < lines.length) {
			const group: PortParts[] = [];
			let j = i;
			while (j < lines.length) {
				const { code, comment } = splitComment(lines[j], commentStarts[j]);
				const parsed = parsePort(code, comment, patterns.port);
				if (!parsed) break;
				group.push(parsed);
				j++;
			}
			if (group.length >= 2) {
				const rendered = renderPortGroup(group);
				for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
				i = j;
			} else {
				i = j > i ? j : i + 1;
			}
		}
	}

	if (alignAssignments) {
		let i = 0;
		while (i < out.length) {
			const rows: Array<{ lhs: string; rhs: string; comment: string }> = [];
			let j = i;
			while (j < out.length) {
				const { code, comment } = splitComment(out[j], commentStarts[j]);
				const m = ASSIGN_RE.exec(code);
				if (!m) break;
				rows.push({ lhs: m[1].replace(/\s+/g, " ").trim(), rhs: m[2].trim(), comment });
				j++;
			}
			if (rows.length >= 2) {
				const rendered = renderAssignGroup(rows);
				for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
				i = j;
			} else {
				i = j > i ? j : i + 1;
			}
		}
	}

	if (alignParams) {
		let i = 0;
		while (i < out.length) {
			const rows: Array<{ lhs: string; rhs: string; comment: string }> = [];
			let j = i;
			while (j < out.length) {
				const { code, comment } = splitComment(out[j], commentStarts[j]);
				const m = PARAM_ASSIGN_RE.exec(code);
				if (!m) break;
				rows.push({ lhs: m[1].replace(/\s+/g, " ").trim(), rhs: m[2].trim(), comment });
				j++;
			}
			if (rows.length >= 2) {
				const rendered = renderAssignGroup(rows);
				for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
				i = j;
			} else {
				i = j > i ? j : i + 1;
			}
		}
	}

	if (alignDeclarations) {
		let i = 0;
		while (i < out.length) {
			const group: PortParts[] = [];
			let j = i;
			while (j < out.length) {
				const { code, comment } = splitComment(out[j], commentStarts[j]);
				const parsed = parseDecl(code, comment, patterns.decl);
				if (!parsed) break;
				group.push(parsed);
				j++;
			}
			if (group.length >= 2) {
				const rendered = renderPortGroup(group);
				for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
				i = j;
			} else {
				i = j > i ? j : i + 1;
			}
		}
	}

	if (alignIfElse) {
		let i = 0;
		while (i < out.length) {
			const group: IfElseParts[] = [];
			let j = i;
			while (j < out.length) {
				const { code, comment } = splitComment(out[j], commentStarts[j]);
				const parts = parseIfElse(code, tokensByLine[j] ?? [], comment);
				if (!parts) break;
				group.push(parts);
				j++;
			}
			if (group.length >= 2) {
				const prefixW = Math.max(...group.map((g) => g.prefix.length));
				for (let k = 0; k < group.length; k++) {
					let s = `${group[k].prefix.padEnd(prefixW)} ${group[k].body}`.replace(/[ \t]+$/, "");
					if (group[k].comment) s = `${s}  ${group[k].comment}`;
					out[i + k] = s;
				}
				i = j;
			} else {
				i = j > i ? j : i + 1;
			}
		}
	}

		if (alignDeclAssignments) {
			let i = 0;
			while (i < out.length) {
				const group: DeclAssignParts[] = [];
				let j = i;
				while (j < out.length) {
					const { code, comment } = splitComment(out[j], commentStarts[j]);
					const parsed = parseDeclAssign(code, comment, patterns.declAssign);
					if (!parsed) break;
					group.push(parsed);
					j++;
				}
				if (group.length >= 2) {
					const rendered = renderDeclAssignGroup(group);
					for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
					i = j;
				} else {
					i = j > i ? j : i + 1;
				}
			}
		}

		if (alignInstancePorts) {
			let i = 0;
			while (i < out.length) {
				const group: InstancePortParts[] = [];
				let j = i;
				while (j < out.length) {
					const { code, comment } = splitComment(out[j], commentStarts[j]);
					const parsed = parseInstancePort(code, comment);
					if (!parsed) break;
					group.push(parsed);
					j++;
				}
				if (group.length >= 2) {
					const rendered = renderInstancePortGroup(group);
					for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
					i = j;
				} else {
					i = j > i ? j : i + 1;
				}
			}
		}

	if (alignBlockAssignments) {
		let i = 0;
		while (i < out.length) {
			const group: BlockAssignParts[] = [];
			let j = i;
			while (j < out.length) {
				const { code, comment } = splitComment(out[j], commentStarts[j]);
				const parsed = parseBlockAssign(code, comment);
				if (!parsed) break;
				group.push(parsed);
				j++;
			}
			if (group.length >= 2) {
				const rendered = renderBlockAssignGroup(group);
				for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
				i = j;
			} else {
				i = j > i ? j : i + 1;
			}
		}
	}

	return out;
}
