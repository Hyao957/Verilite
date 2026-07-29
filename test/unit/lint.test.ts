import assert from "node:assert/strict";
import { test } from "node:test";
import { lint } from "../../src/engine/lint";

const codes = (src: string, opts = {}) => lint(src, opts).issues.map((i) => i.code);
const errors = (src: string, opts = {}) =>
	lint(src, opts).issues.filter((i) => i.severity === "error");

test("a clean module produces no errors", () => {
	const src = [
		"`timescale 1ns / 1ps",
		"module counter #(",
		"    parameter WIDTH = 8",
		")(",
		"    input  wire             clk,",
		"    input  wire             rst_n,",
		"    output reg  [WIDTH-1:0] cnt",
		");",
		"",
		"    always @(posedge clk or negedge rst_n) begin",
		"        if (!rst_n)",
		"            cnt <= {WIDTH{1'b0}};",
		"        else",
		"            cnt <= cnt + 1'b1;",
		"    end",
		"",
		"endmodule",
	].join("\n");
	assert.deepEqual(errors(src), []);
});

test("missing end is reported", () => {
	const src = "module m;\n  always @(*) begin\n    a = 1;\nendmodule\n";
	assert.ok(codes(src).includes("mismatched-pair"));
});

test("extra end is reported", () => {
	const src = "module m;\n  initial begin\n    a = 1;\n  end\n  end\nendmodule\n";
	assert.ok(codes(src).some((c) => c === "unmatched-closer" || c === "mismatched-pair"));
});

test("unclosed module is reported", () => {
	assert.ok(codes("module m;\n  reg a;\n").includes("missing-closer"));
});

test("begin / end inside comments is ignored", () => {
	const src = "module m;\n  // begin\n  /* end end end */\n  reg a;\nendmodule\n";
	assert.deepEqual(errors(src), []);
});

test("nested begin-end pairs are matched", () => {
	const src = [
		"module m;",
		"  always @(*) begin",
		"    if (a) begin",
		"      b = 1;",
		"    end",
		"    else begin",
		"      b = 0;",
		"    end",
		"  end",
		"endmodule",
	].join("\n");
	assert.deepEqual(errors(src), []);
});

test("conditional compilation nests correctly", () => {
	const src = [
		"`ifndef GUARD",
		"`define GUARD",
		"`ifdef FAST",
		"`define MODE 1",
		"`endif",
		"`endif",
	].join("\n");
	assert.deepEqual(errors(src), []);
});

test("unbalanced ifdef is reported", () => {
	assert.ok(codes("`ifdef A\n`define B 1\n").includes("missing-closer"));
});

test("unbalanced brackets are reported", () => {
	assert.ok(codes("module m;\n assign a = (b + c;\nendmodule\n").includes("unclosed-bracket"));
	assert.ok(codes("module m;\n assign a = b + c);\nendmodule\n").includes("unmatched-bracket"));
});

test("unterminated string is reported", () => {
	assert.ok(codes('module m;\n initial $display("oops);\nendmodule\n').includes("unterminated-string"));
});

test("missing semicolon on a declaration is reported", () => {
	const src = "module m;\n  wire a\n  reg b;\nendmodule\n";
	assert.ok(codes(src).includes("missing-semicolon"));
});

test("multi-line declarations are not false positives", () => {
	const src = [
		"module m;",
		"  assign y = a +",
		"             b;",
		"  wire c, d,",
		"       e;",
		"endmodule",
	].join("\n");
	assert.deepEqual(errors(src), []);
});

test("code after endmodule is reported", () => {
	assert.ok(codes("module m;\nendmodule\nreg stray;\n").includes("code-after-endmodule"));
});

test("a second module after endmodule is fine", () => {
	assert.deepEqual(errors("module a;\nendmodule\nmodule b;\nendmodule\n"), []);
});

test("always without sensitivity list warns", () => {
	const src = "module m;\n  always begin\n    #5 clk = ~clk;\n  end\nendmodule\n";
	const result = lint(src);
	assert.ok(result.issues.some((i) => i.code === "always-no-sensitivity" && i.severity === "warning"));
	assert.deepEqual(errors(src), []);
});

test("case without default warns, with default does not", () => {
	const bad = "module m;\n always @(*) case (s)\n  2'b00: y = 1;\n endcase\nendmodule\n";
	const good = "module m;\n always @(*) case (s)\n  2'b00: y = 1;\n  default: y = 0;\n endcase\nendmodule\n";
	assert.ok(codes(bad).includes("case-without-default"));
	assert.ok(!codes(good).includes("case-without-default"));
});

test("blocking assignment in a sequential block warns", () => {
	const src = "module m;\n always @(posedge clk) begin\n  q = d;\n end\nendmodule\n";
	assert.ok(codes(src).includes("blocking-in-sequential"));
});

test("non-blocking assignment in a combinational block warns", () => {
	const src = "module m;\n always @(*) begin\n  y <= a;\n end\nendmodule\n";
	assert.ok(codes(src).includes("nonblocking-in-combinational"));
});

test("for-loop index assignment is not flagged", () => {
	const src = [
		"module m;",
		"  integer i;",
		"  always @(posedge clk) begin",
		"    for (i = 0; i < 8; i = i + 1) begin",
		"      q[i] <= d[i];",
		"    end",
		"  end",
		"endmodule",
	].join("\n");
	assert.ok(!codes(src).includes("blocking-in-sequential"));
});

test("comparison operators are not treated as assignments", () => {
	const src = "module m;\n always @(posedge clk) if (a == b) q <= 1;\nendmodule\n";
	assert.ok(!codes(src).includes("blocking-in-sequential"));
});

test("disable fork is not a block opener", () => {
	const src = "module m;\n initial begin\n  disable fork;\n end\nendmodule\n";
	assert.deepEqual(errors(src), []);
});

test("issue list is capped by maxIssues", () => {
	const src = "module m;\n" + "  end\n".repeat(20) + "endmodule\n";
	const r = lint(src, { maxIssues: 5 });
	assert.equal(r.truncated, true);
	assert.ok(r.issues.length <= 6);
});

test("empty input does not crash", () => {
	assert.deepEqual(lint("").issues, []);
});
