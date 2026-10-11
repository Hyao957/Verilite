/** Static Verilog vocabulary shared by the lexer, linter and completion. */

import type { Dialect } from "./types";

export const CONTROL_KEYWORDS: string[] = [
	"module", "macromodule", "endmodule", "primitive", "endprimitive",
	"config", "endconfig", "generate", "endgenerate", "function", "endfunction",
	"task", "endtask", "specify", "endspecify", "table", "endtable",
	"begin", "end", "fork", "join",
	"case", "casex", "casez", "endcase", "default",
	"if", "else", "for", "while", "repeat", "forever",
	"always", "initial",
	"assign", "deassign", "force", "release", "disable", "wait",
	"posedge", "negedge", "edge", "defparam",
	"and", "or", "nand", "nor", "xor", "xnor", "not", "buf",
];

export const DATA_TYPES: string[] = [
	"wire", "tri", "tri0", "tri1", "triand", "trior", "trireg",
	"wand", "wor", "supply0", "supply1",
	"reg", "integer", "real", "realtime", "time",
	"genvar", "event", "parameter", "localparam", "specparam",
	"input", "output", "inout", "signed", "unsigned", "automatic",
];

export const DIRECTIVES: string[] = [
	"define", "undef", "ifdef", "ifndef", "elsif", "else", "endif",
	"include", "timescale", "resetall", "default_nettype",
	"celldefine", "endcelldefine", "line", "pragma",
];

export const SYSTEM_TASKS: string[] = [
	"$display", "$write", "$monitor", "$strobe", "$time", "$realtime",
	"$stime", "$finish", "$stop", "$random",
	"$readmemb", "$readmemh", "$writememb", "$writememh",
	"$fopen", "$fclose", "$fwrite", "$fdisplay", "$fgets", "$fscanf",
	"$signed", "$unsigned", "$dumpfile", "$dumpvars", "$test$plusargs",
];

/** Documentation shown next to keyword completion items. */
export const KEYWORD_DOCS: Record<string, string> = {
	module: "\u5b9a\u4e49\u4e00\u4e2a\u6a21\u5757",
	endmodule: "\u7ed3\u675f\u6a21\u5757\u5b9a\u4e49",
	always: "\u8fc7\u7a0b\u5757\uff0c\u9700\u8981\u654f\u611f\u5217\u8868",
	assign: "\u8fde\u7eed\u8d4b\u503c\uff08\u7ec4\u5408\u903b\u8f91\uff09",
	begin: "\u987a\u5e8f\u8bed\u53e5\u5757\u5f00\u59cb",
	end: "\u987a\u5e8f\u8bed\u53e5\u5757\u7ed3\u675f",
	case: "\u5206\u652f\u9009\u62e9\u8bed\u53e5",
	casex: "case \u53d8\u4f53\uff0cx \u548c z \u89c6\u4e3a\u65e0\u5173\u4f4d",
	casez: "case \u53d8\u4f53\uff0cz \u89c6\u4e3a\u65e0\u5173\u4f4d",
	generate: "\u751f\u6210\u5757\uff0c\u914d\u5408 genvar \u4f7f\u7528",
	posedge: "\u4e0a\u5347\u6cbf",
	negedge: "\u4e0b\u964d\u6cbf",
	wire: "\u7ebf\u7f51\u7c7b\u578b\uff0c\u7528\u4e8e\u8fde\u7eed\u8d4b\u503c",
	reg: "\u5bc4\u5b58\u7c7b\u578b\uff0c\u7528\u4e8e\u8fc7\u7a0b\u8d4b\u503c",
	parameter: "\u53c2\u6570\uff0c\u53ef\u5728\u5b9e\u4f8b\u5316\u65f6\u8986\u76d6",
	localparam: "\u5c40\u90e8\u53c2\u6570\uff0c\u4e0d\u53ef\u88ab\u8986\u76d6",
	genvar: "generate \u5faa\u73af\u53d8\u91cf",
};

/** Block keyword pairs used by the pair checker and the indenter. */
export const BLOCK_PAIRS: Record<string, string[]> = {
	module: ["endmodule"],
	macromodule: ["endmodule"],
	primitive: ["endprimitive"],
	config: ["endconfig"],
	begin: ["end"],
	case: ["endcase"],
	casex: ["endcase"],
	casez: ["endcase"],
	function: ["endfunction"],
	task: ["endtask"],
	generate: ["endgenerate"],
	specify: ["endspecify"],
	table: ["endtable"],
	fork: ["join"],
	"`ifdef": ["`endif"],
	"`ifndef": ["`endif"],
};

/** closer -> list of openers that accept it */
export const CLOSER_TO_OPENERS: Record<string, string[]> = (() => {
	const map: Record<string, string[]> = {};
	for (const opener of Object.keys(BLOCK_PAIRS)) {
		for (const closer of BLOCK_PAIRS[opener]) {
			(map[closer] ||= []).push(opener);
		}
	}
	return map;
})();

export const BLOCK_OPENERS = new Set(Object.keys(BLOCK_PAIRS));
export const BLOCK_CLOSERS = new Set(Object.keys(CLOSER_TO_OPENERS));

/**
 * Openers that raise the indent level on their own line.
 * `module` is excluded: its body indent is triggered by the `;` that ends the
 * port list, otherwise `module foo #(` would indent twice.
 */
export const INDENT_OPENERS = new Set([
	"begin", "case", "casex", "casez", "function", "task",
	"generate", "specify", "table", "fork",
]);

export const INDENT_CLOSERS = new Set([
	"end", "endcase", "endfunction", "endtask", "endgenerate",
	"endspecify", "endtable", "endmodule", "endprimitive", "endconfig",
	"join",
]);

/** Keywords that may legally start a new statement / declaration. */
export const STATEMENT_STARTERS = new Set([
	"wire", "reg", "integer", "real", "time", "genvar", "event",
	"parameter", "localparam", "assign", "always", "initial", "module", "endmodule", "generate",
	"endgenerate", "function", "endfunction", "task", "endtask", "begin",
	"end", "if", "case", "casex", "casez", "endcase", "input", "output",
	"inout", "defparam", "for", "while", "repeat", "forever",
]);

export const DECLARATION_STARTERS = new Set([
	"wire", "reg", "integer", "real", "time", "genvar", "event",
	"parameter", "localparam", "assign", "defparam",
]);

export const KEYWORD_SET = new Set<string>([
	...CONTROL_KEYWORDS,
	...DATA_TYPES,
]);

/**
 * Statement heads that indent a following single statement when they are not
 * followed by `begin` (e.g. `if (c) x <= 1;`). Shared by the indenter and the
 * `joinBegin` formatter pass; lives here so it can vary by dialect.
 */
export const SINGLE_STATEMENT_HEADS_BASE: string[] = [
	"if", "else", "for", "while", "repeat",
	"always",
];

// ============================================================================
// SystemVerilog extensions. Each is a strict superset of the Verilog baseline
// above; "verilog" bundles are built purely from the existing constants so the
// Verilog token stream / indent behaviour is byte-for-byte unchanged.
// ============================================================================

const SV_CONTROL_KEYWORDS: string[] = [
	"interface", "endinterface", "package", "endpackage", "class", "endclass",
	"program", "endprogram", "clocking", "endclocking", "property", "endproperty",
	"sequence", "endsequence", "covergroup", "endgroup", "checker", "endchecker",
	"typedef", "enum", "struct", "union", "modport", "import", "export", "extern",
	"return", "virtual", "extends", "implements", "pure", "constraint",
	"always_comb", "always_ff", "always_latch", "final", "do",
	"join_any", "join_none",
	"assert", "assume", "cover", "expect", "unique", "priority", "tagged",
	"wildcard", "inside", "dist", "break", "continue", "foreach", "new",
	"super", "this", "null", "randcase", "randsequence", "solve", "before",
	"accept_on", "alias", "bind", "bins", "binsof", "context", "coverpoint",
	"cross", "eventually", "first_match", "forkjoin", "global",
	"iff", "ignore_bins", "illegal_bins", "implies", "interconnect", "intersect",
	"let", "matches", "nettype", "nexttime", "packed", "reject_on", "restrict",
	"s_always", "s_eventually", "s_nexttime", "s_until", "s_until_with",
	"soft", "strong", "sync_accept_on", "sync_reject_on", "throughout",
	"timeprecision", "timeunit", "type", "unique0", "until", "until_with",
	"wait_order", "weak", "with", "within",
];

const SV_DATA_TYPES: string[] = [
	"logic", "bit", "byte", "shortint", "int", "longint", "shortreal", "string",
	"chandle", "void", "var", "const", "ref", "static", "protected", "local",
	"rand", "randc", "mailbox", "semaphore", "process",
];

const SV_DIRECTIVES: string[] = [
	"undefineall", "begin_keywords", "end_keywords",
	"unconnected_drive", "nounconnected_drive", "__FILE__", "__LINE__",
];

const SV_SYSTEM_TASKS: string[] = [
	"$urandom", "$urandom_range", "$clog2", "$bits", "$size", "$sformatf",
	"$fatal", "$error", "$warning", "$info",
	"$cast", "$assertoff", "$asserton", "$assertkill", "$assertcontrol",
	"$sampled", "$rose", "$fell", "$stable", "$changed", "$past",
	"$onehot", "$onehot0", "$countones", "$isunknown",
	"$left", "$right", "$low", "$high", "$increment",
	"$dimensions", "$unpacked_dimensions", "$global_clock",
];

const SV_BLOCK_PAIRS: Record<string, string[]> = {
	fork: ["join", "join_any", "join_none"],
	interface: ["endinterface"],
	package: ["endpackage"],
	class: ["endclass"],
	program: ["endprogram"],
	clocking: ["endclocking"],
	property: ["endproperty"],
	sequence: ["endsequence"],
	covergroup: ["endgroup"],
	checker: ["endchecker"],
	randcase: ["endcase"],
	randsequence: ["endsequence"],
};

const SV_INDENT_OPENERS: string[] = [
	"package", "class", "clocking", "property", "sequence", "covergroup",
	"randcase", "randsequence",
];
const SV_INDENT_CLOSERS: string[] = [
	"endinterface", "endpackage", "endclass", "endprogram", "endclocking",
	"endproperty", "endsequence", "endgroup", "endchecker",
	"join_any", "join_none",
];
const SV_STATEMENT_STARTERS: string[] = [
	"interface", "package", "class", "program", "typedef", "enum",
	"import", "export", "covergroup", "property", "sequence",
	"logic", "bit", "byte", "shortint", "int", "longint", "shortreal", "string",
	"chandle", "void", "var",
];
const SV_DECLARATION_STARTERS: string[] = [
	"logic", "bit", "byte", "shortint", "int", "longint", "shortreal", "string",
	"chandle", "var",
];
const SV_SINGLE_STATEMENT_HEADS: string[] = [
	"always_ff", "always_comb", "always_latch", "foreach",
];

const SV_KEYWORD_DOCS: Record<string, string> = {
	interface: "\u63a5\u53e3\uff0c\u5c01\u88c5\u4fe1\u53f7\u3001\u7aef\u53e3\u4e0e modport",
	package: "\u5305\uff0c\u7ec4\u7ec7\u53ef\u590d\u7528\u7684\u7c7b\u578b\u4e0e\u53c2\u6570",
	class: "\u7c7b\uff0c\u9762\u5411\u5bf9\u8c61",
	typedef: "\u7c7b\u578b\u5b9a\u4e49",
	enum: "\u679a\u4e3e\u7c7b\u578b",
	struct: "\u7ed3\u6784\u4f53",
	union: "\u8054\u5408\u4f53",
	unique: "unique case\uff0c\u5206\u652f\u4e92\u65a5",
	priority: "priority case\uff0c\u6309\u4f18\u5148\u7ea7\u5339\u914d",
	foreach: "foreach \u6570\u7ec4\u904d\u5386\u5faa\u73af",
	import: "\u5bfc\u5165\u5305",
	static: "\u9759\u6001\u53d8\u91cf/\u65b9\u6cd5",
	extends: "\u7ee7\u627f\uff0cclass \u5b50\u7c7b extends \u7236\u7c7b",
	virtual: "\u865a\u65b9\u6cd5 / \u865a\u63a5\u53e3",
	new: "\u6784\u9020\u51fd\u6570\u6216\u5bf9\u8c61\u5b9e\u4f8b\u5316",
	rand: "\u968f\u673a\u53d8\u91cf\uff0c\u6bcf\u6b21 randomize \u91cd\u65b0\u53d6\u503c",
	randc: "\u5faa\u73af\u968f\u673a\u53d8\u91cf\uff0c\u904d\u5386\u6240\u6709\u53d6\u503c\u540e\u518d\u91cd\u590d",
	constraint: "\u7ea6\u675f\u5757\uff0c\u9650\u5b9a\u968f\u673a\u53d8\u91cf\u7684\u53d6\u503c\u8303\u56f4",
	mailbox: "\u90ae\u7bb1\uff0c\u7ebf\u7a0b\u95f4\u4f20\u9012\u6d88\u606f",
	semaphore: "\u4fe1\u53f7\u91cf\uff0c\u63a7\u5236\u5bf9\u5171\u4eab\u8d44\u6e90\u7684\u5e76\u53d1\u8bbf\u95ee",
	modport: "\u63a5\u53e3\u7684\u7aef\u53e3\u65b9\u5411\u89c6\u56fe",
};

// ============================================================================
// Dialect bundles + accessors
// ============================================================================

export interface KeywordBundle {
	/** control keywords (completion: Keyword kind) */
	control: string[];
	/** data types (completion: TypeParameter kind) */
	dataTypes: string[];
	/** compiler directives without the leading backtick */
	directives: string[];
	/** hover / completion documentation by keyword */
	docs: Record<string, string>;
	/** keyword-classification set = control + dataTypes (drives the lexer) */
	set: Set<string>;
}

export interface IndentPairs {
	blockPairs: Record<string, string[]>;
	closerToOpeners: Record<string, string[]>;
	indentOpeners: Set<string>;
	indentClosers: Set<string>;
	statementStarters: Set<string>;
	declarationStarters: Set<string>;
	singleStatementHeads: Set<string>;
}

function buildKeywordBundle(
	control: string[],
	dataTypes: string[],
	directives: string[],
	docs: Record<string, string>,
): KeywordBundle {
	return { control, dataTypes, directives, docs, set: new Set<string>([...control, ...dataTypes]) };
}

function buildCloserToOpeners(pairs: Record<string, string[]>): Record<string, string[]> {
	const map: Record<string, string[]> = {};
	for (const opener of Object.keys(pairs)) {
		for (const closer of pairs[opener]) {
			(map[closer] ||= []).push(opener);
		}
	}
	return map;
}

function buildIndentPairs(
	blockPairs: Record<string, string[]>,
	indentOpeners: string[],
	indentClosers: string[],
	statementStarters: string[],
	declarationStarters: string[],
	singleStatementHeads: string[],
): IndentPairs {
	return {
		blockPairs,
		closerToOpeners: buildCloserToOpeners(blockPairs),
		indentOpeners: new Set(indentOpeners),
		indentClosers: new Set(indentClosers),
		statementStarters: new Set(statementStarters),
		declarationStarters: new Set(declarationStarters),
		singleStatementHeads: new Set(singleStatementHeads),
	};
}

const KEYWORDS: Record<Dialect, KeywordBundle> = {
	verilog: buildKeywordBundle(CONTROL_KEYWORDS, DATA_TYPES, DIRECTIVES, KEYWORD_DOCS),
	systemverilog: buildKeywordBundle(
		[...CONTROL_KEYWORDS, ...SV_CONTROL_KEYWORDS],
		[...DATA_TYPES, ...SV_DATA_TYPES],
		[...DIRECTIVES, ...SV_DIRECTIVES],
		{ ...KEYWORD_DOCS, ...SV_KEYWORD_DOCS },
	),
};

const INDENT: Record<Dialect, IndentPairs> = {
	verilog: buildIndentPairs(
		BLOCK_PAIRS,
		[...INDENT_OPENERS],
		[...INDENT_CLOSERS],
		[...STATEMENT_STARTERS],
		[...DECLARATION_STARTERS],
		SINGLE_STATEMENT_HEADS_BASE,
	),
	systemverilog: buildIndentPairs(
		{ ...BLOCK_PAIRS, ...SV_BLOCK_PAIRS },
		[...INDENT_OPENERS, ...SV_INDENT_OPENERS],
		[...INDENT_CLOSERS, ...SV_INDENT_CLOSERS],
		[...STATEMENT_STARTERS, ...SV_STATEMENT_STARTERS],
		[...DECLARATION_STARTERS, ...SV_DECLARATION_STARTERS],
		[...SINGLE_STATEMENT_HEADS_BASE, ...SV_SINGLE_STATEMENT_HEADS],
	),
};

const SYSTEM_TASKS_BY_DIALECT: Record<Dialect, string[]> = {
	verilog: SYSTEM_TASKS,
	systemverilog: [...SYSTEM_TASKS, ...SV_SYSTEM_TASKS],
};

/** Keyword vocabulary for a dialect (lexer classification + completion lists). */
export function keywordsFor(dialect: Dialect): KeywordBundle {
	return KEYWORDS[dialect];
}

/** Block-pair and indentation tables for a dialect. */
export function indentPairsFor(dialect: Dialect): IndentPairs {
	return INDENT[dialect];
}

/** System task names ($display, ...) offered in completion for a dialect. */
export function systemTasksFor(dialect: Dialect): string[] {
	return SYSTEM_TASKS_BY_DIALECT[dialect];
}
