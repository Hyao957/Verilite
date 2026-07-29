import assert from "node:assert/strict";
import { test } from "node:test";
import { lex } from "../../src/core/lexer";
import { firstModuleName, outlineFile, scanSymbols } from "../../src/engine/symbols";

const SRC = [
	"module fifo #(",
	"    parameter DEPTH = 16",
	")(",
	"    input  wire        clk,",
	"    input  wire        rst_n,",
	"    input  wire [31:0] din,",
	"    output reg  [31:0] dout",
	");",
	"    reg [7:0] head, tail;",
	"    wire empty;",
	"endmodule",
].join("\n");

test("module name is found", () => {
	assert.equal(firstModuleName(lex(SRC)), "fifo");
});

test("ports, signals and parameters are collected", () => {
	const symbols = scanSymbols(SRC);
	const byName = new Map(symbols.map((s) => [s.name, s]));

	assert.equal(byName.get("clk")?.kind, "port");
	assert.equal(byName.get("din")?.detail, "input wire [31:0]");
	assert.equal(byName.get("dout")?.kind, "port");
	assert.equal(byName.get("DEPTH")?.kind, "parameter");
	assert.equal(byName.get("empty")?.kind, "signal");
	assert.equal(byName.get("fifo")?.kind, "module");
});

test("comma separated declarations yield every name", () => {
	const names = scanSymbols(SRC).map((s) => s.name);
	assert.ok(names.includes("head"));
	assert.ok(names.includes("tail"));
});

test("duplicates are removed", () => {
	const names = scanSymbols(SRC + "\n" + SRC).map((s) => s.name);
	assert.equal(new Set(names).size, names.length);
});

test("symbols in comments are ignored", () => {
	const names = scanSymbols("module m;\n// wire ghost;\nendmodule").map((s) => s.name);
	assert.ok(!names.includes("ghost"));
});

test("symbols carry the column of the declared name", () => {
	const symbols = scanSymbols("module m;\n  wire data;\nendmodule\n");
	const data = symbols.find((s) => s.name === "data")!;
	// "  wire data;" -> 'data' starts at column 7
	assert.equal(data.col, 7);
});

test("outlineFile groups members under their module", () => {
	const outline = outlineFile(lex(SRC));
	assert.equal(outline.modules.length, 1);
	const m = outline.modules[0];
	assert.equal(m.name, "fifo");
	assert.equal(m.endLine, 10); // the `endmodule` line
	const memberNames = m.members.map((s) => s.name);
	for (const n of ["clk", "rst_n", "din", "dout", "DEPTH", "head", "tail", "empty"]) {
		assert.ok(memberNames.includes(n), `expected member ${n}`);
	}
	assert.equal(outline.loose.length, 0);
});

test("outlineFile handles multiple modules", () => {
	const src = "module a;\n  wire x;\nendmodule\nmodule b;\n  wire y;\nendmodule\n";
	const outline = outlineFile(lex(src));
	assert.deepEqual(outline.modules.map((m) => m.name), ["a", "b"]);
	assert.deepEqual(outline.modules[0].members.map((s) => s.name), ["x"]);
	assert.deepEqual(outline.modules[1].members.map((s) => s.name), ["y"]);
});

test("outlineFile puts stray symbols in loose", () => {
	const src = "wire stray;\nmodule a;\n  wire x;\nendmodule\n";
	const outline = outlineFile(lex(src));
	assert.deepEqual(outline.loose.map((s) => s.name), ["stray"]);
	assert.deepEqual(outline.modules[0].members.map((s) => s.name), ["x"]);
});

test("outlineFile does not crash on an unclosed module", () => {
	const outline = outlineFile(lex("module a;\n  wire x;\n"));
	assert.equal(outline.modules.length, 1);
	assert.deepEqual(outline.modules[0].members.map((s) => s.name), ["x"]);
});
