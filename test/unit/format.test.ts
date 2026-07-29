import assert from "node:assert/strict";
import { test } from "node:test";
import { computeStartLevel, formatText } from "../../src/engine/format";

const MESSY = [
	"`timescale 1ns/1ps",
	"module counter #(",
	"parameter WIDTH=8",
	")(",
	"input wire clk,",
	"input wire rst_n,",
	"input wire [31:0] data_in,",
	"output reg [7:0] data_out",
	");",
	"reg [WIDTH-1:0] cnt;",
	"always @(posedge clk or negedge rst_n) begin",
	"if(!rst_n) begin",
	"cnt<=0;",
	"end",
	"else begin",
	"cnt<=cnt+1;",
	"end",
	"end",
	"endmodule",
].join("\n");

test("formatting is idempotent", () => {
	const once = formatText(MESSY);
	const twice = formatText(once);
	assert.equal(twice, once);
});

test("module body gets exactly one indent level", () => {
	const lines = formatText(MESSY).split("\n");
	const cnt = lines.find((l) => l.trim().startsWith("reg [WIDTH-1:0] cnt"))!;
	assert.equal(cnt, "    reg [WIDTH-1:0] cnt;");
});

test("module header lines are not double-indented", () => {
	const lines = formatText(MESSY).split("\n");
	assert.equal(lines[1], "module counter #(");
	assert.equal(lines[2], "    parameter WIDTH = 8");
	assert.equal(lines[3], ")(");
	assert.equal(lines[8], ");");
});

test("endmodule returns to column zero", () => {
	const lines = formatText(MESSY).split("\n");
	assert.equal(lines[lines.length - 1], "endmodule");
});

test("nested begin-end indents correctly", () => {
	const out = formatText(MESSY);
	assert.ok(out.includes("\n        if (!rst_n) begin\n"));
	assert.ok(out.includes("\n            cnt <= 0;\n"));
	assert.ok(out.includes("\n        end\n        else begin\n"));
});

test("ports are aligned into columns", () => {
	const out = formatText(MESSY).split("\n");
	assert.equal(out[4], "    input  wire [31:0] clk,".replace("[31:0] ", "       "));
	assert.equal(out[6], "    input  wire [31:0] data_in,");
	assert.equal(out[7], "    output reg  [ 7:0] data_out");
});

test("tab indent style is honoured", () => {
	const out = formatText("module m;\nreg a;\nendmodule\n", { indentStyle: "tab" });
	assert.ok(out.includes("\n\treg a;\n"));
});

test("indent size is honoured", () => {
	const out = formatText("module m;\nreg a;\nendmodule\n", { indentSize: 2 });
	assert.ok(out.includes("\n  reg a;\n"));
});

test("comments are never rewritten", () => {
	const src = "module m;\n// keep    these    spaces\n/* and\n   these */\nreg a;\nendmodule\n";
	const out = formatText(src);
	assert.ok(out.includes("// keep    these    spaces"));
	assert.ok(out.includes("   these */"));
});

test("string literals are never rewritten", () => {
	const src = 'module m;\ninitial $display("a==b   ,  c");\nendmodule\n';
	const out = formatText(src);
	assert.ok(out.includes('"a==b   ,  c"'));
});

test("trailing comments keep a gap", () => {
	const out = formatText("module m;\nreg a;// note\nendmodule\n");
	assert.ok(out.includes("reg a; // note"));
});

test("bit selects and case labels are left alone", () => {
	const src = [
		"module m;",
		"always @(*) case (s)",
		"2'b00: y = a[7:0];",
		"default: y = -1;",
		"endcase",
		"endmodule",
	].join("\n");
	const out = formatText(src);
	assert.ok(out.includes("2'b00: y = a[7:0];"));
	assert.ok(out.includes("default: y = -1;"));
});

test("case body is indented and endcase dedented", () => {
	const src = "module m;\nalways @(*) begin\ncase (s)\n2'b00: y = 1;\ndefault: y = 0;\nendcase\nend\nendmodule\n";
	const out = formatText(src).split("\n");
	assert.equal(out[2], "        case (s)");
	assert.equal(out[3], "            2'b00: y = 1;");
	assert.equal(out[5], "        endcase");
});

test("generate blocks indent", () => {
	const src = "module m;\ngenerate\nfor (i=0;i<4;i=i+1) begin : g\nassign y[i] = a[i];\nend\nendgenerate\nendmodule\n";
	const out = formatText(src).split("\n");
	assert.equal(out[1], "    generate");
	// note: '<' and '+' are deliberately left untouched, they are ambiguous in Verilog
	assert.equal(out[2], "        for (i = 0; i<4; i = i+1) begin : g");
	assert.equal(out[3], "            assign y[i] = a[i];");
	assert.equal(out[5], "    endgenerate");
});

test("multi-line sensitivity list closes correctly", () => {
	const src = "module m;\nalways @(posedge clk\nor negedge rst_n\n) begin\nq <= d;\nend\nendmodule\n";
	const out = formatText(src).split("\n");
	assert.equal(out[3], "    ) begin");
	assert.equal(out[4], "        q <= d;");
	assert.equal(out[5], "    end");
});

test("selection formatting inherits the outer indent level", () => {
	const before = "module m;\n    always @(*) begin\n";
	assert.equal(computeStartLevel(before), 2);
	const out = formatText("y = a;\n", {}, computeStartLevel(before));
	assert.equal(out, "        y = a;\n".replace(/\n$/, "\n"));
});

test("empty and single-line inputs do not crash", () => {
	assert.equal(formatText(""), "");
	assert.equal(formatText("reg a;"), "reg a;");
	assert.equal(formatText("\n\n\n"), "\n\n\n");
});

test("assignment alignment is opt-in", () => {
	const src = "module m;\nassign a = 1;\nassign bbb = 2;\nendmodule\n";
	assert.ok(!formatText(src).includes("assign a   = 1;"));
	assert.ok(formatText(src, { alignAssignments: true }).includes("assign a   = 1;"));
});
