import assert from "node:assert/strict";
import { test } from "node:test";
import { lex } from "../../src/core/lexer";
import { firstModuleName, scanSymbols } from "../../src/engine/symbols";

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
