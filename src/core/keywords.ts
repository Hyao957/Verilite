/** Static Verilog vocabulary shared by the lexer, linter and completion. */

export const CONTROL_KEYWORDS: string[] = [
	"module", "macromodule", "endmodule", "primitive", "endprimitive",
	"config", "endconfig", "generate", "endgenerate", "function", "endfunction",
	"task", "endtask", "specify", "endspecify", "table", "endtable",
	"begin", "end", "fork", "join", "join_any", "join_none",
	"case", "casex", "casez", "endcase", "default",
	"if", "else", "for", "while", "repeat", "forever", "do",
	"always", "always_comb", "always_ff", "always_latch", "initial", "final",
	"assign", "deassign", "force", "release", "disable", "wait",
	"posedge", "negedge", "edge", "defparam",
	"and", "or", "nand", "nor", "xor", "xnor", "not", "buf",
];

export const DATA_TYPES: string[] = [
	"wire", "tri", "tri0", "tri1", "triand", "trior", "trireg",
	"wand", "wor", "supply0", "supply1",
	"reg", "logic", "integer", "real", "realtime", "time",
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
	"$stime", "$finish", "$stop", "$random", "$urandom", "$urandom_range",
	"$readmemb", "$readmemh", "$writememb", "$writememh",
	"$fopen", "$fclose", "$fwrite", "$fdisplay", "$fgets", "$fscanf",
	"$signed", "$unsigned", "$clog2", "$bits", "$size", "$dumpfile", "$dumpvars",
	"$sformatf", "$fatal", "$error", "$warning", "$info", "$test$plusargs",
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
	fork: ["join", "join_any", "join_none"],
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
	"join", "join_any", "join_none",
]);

/** Keywords that may legally start a new statement / declaration. */
export const STATEMENT_STARTERS = new Set([
	"wire", "reg", "logic", "integer", "real", "time", "genvar", "event",
	"parameter", "localparam", "assign", "always", "always_comb", "always_ff",
	"always_latch", "initial", "final", "module", "endmodule", "generate",
	"endgenerate", "function", "endfunction", "task", "endtask", "begin",
	"end", "if", "case", "casex", "casez", "endcase", "input", "output",
	"inout", "defparam", "for", "while", "repeat", "forever",
]);

export const DECLARATION_STARTERS = new Set([
	"wire", "reg", "logic", "integer", "real", "time", "genvar", "event",
	"parameter", "localparam", "assign", "defparam",
]);

export const KEYWORD_SET = new Set<string>([
	...CONTROL_KEYWORDS,
	...DATA_TYPES,
]);
