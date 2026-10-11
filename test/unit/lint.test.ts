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

test("randcase does not desync the case-without-default frames", () => {
	const src = [
		"module tb;", // 0
		"  initial begin", // 1
		"    case (a)", // 2
		"      1: begin", // 3
		"           randcase", // 4
		"             1: x = 0;", // 5
		"           endcase", // 6
		"         end", // 7
		"    endcase", // 8
		"  end", // 9
		"endmodule", // 10
	].join("\n");

	assert.deepEqual(
		lint(src, {}, "systemverilog").issues.map((i) => i.code + "@" + i.line),
		["case-without-default@2"],
	);
});

test("a randcase without a default branch is not flagged", () => {
	const src = [
		"module tb;",
		"  initial begin",
		"    randcase",
		"      1: x = 0;",
		"    endcase",
		"  end",
		"endmodule",
	].join("\n");

	assert.deepEqual(lint(src, {}, "systemverilog").issues, []);
});

test("unique/priority case without default is still flagged", () => {
	const unique = "module m;\n  always_comb unique case (s)\n    1: y = 1;\n  endcase\nendmodule\n";
	const priority = "module m;\n  always_comb priority case (s)\n    1: y = 1;\n  endcase\nendmodule\n";
	assert.ok(lint(unique, {}, "systemverilog").issues.some((i) => i.code === "case-without-default"));
	assert.ok(lint(priority, {}, "systemverilog").issues.some((i) => i.code === "case-without-default"));
});

test("always_comb / always_latch with a sensitivity list is flagged in SV only", () => {
	const comb = "module m;\n  always_comb @(*) begin\n    y = a;\n  end\nendmodule\n";
	const latch = "module m;\n  always_latch @(a or b) y = a & b;\nendmodule\n";
	const code = "sv-always-sensitivity";

	assert.ok(lint(comb, {}, "systemverilog").issues.some((i) => i.code === code));
	assert.ok(lint(latch, {}, "systemverilog").issues.some((i) => i.code === code));
	// `.v` files never see the SystemVerilog-only rule.
	assert.ok(!lint(comb, {}, "verilog").issues.some((i) => i.code === code));
	assert.ok(!lint(latch, {}, "verilog").issues.some((i) => i.code === code));
});

test("always_comb without a sensitivity list is fine", () => {
	const src = "module m;\n  always_comb begin\n    y = a & b;\n  end\nendmodule\n";
	assert.ok(!lint(src, {}, "systemverilog").issues.some((i) => i.code === "sv-always-sensitivity"));
});

test("always_ff must use an explicit edge, never '*'", () => {
	const code = "sv-always-sensitivity";
	const bare = "module m;\n  always_ff @* q <= d;\nendmodule\n";
	const paren = "module m;\n  always_ff @(*) q <= d;\nendmodule\n";
	const good = "module m;\n  always_ff @(posedge clk) q <= d;\nendmodule\n";

	assert.ok(lint(bare, {}, "systemverilog").issues.some((i) => i.code === code));
	assert.ok(lint(paren, {}, "systemverilog").issues.some((i) => i.code === code));
	assert.ok(!lint(good, {}, "systemverilog").issues.some((i) => i.code === code));
});

test("endclass / endinterface / endpackage label must match the declaration", () => {
	const bad = "class c;\nendclass : d\n";
	const badIface = "interface bus;\nendinterface : other\n";
	const good = "class c;\nendclass : c\n";
	const plain = "class c;\nendclass\n";
	const code = "sv-end-label";

	assert.ok(lint(bad, {}, "systemverilog").issues.some((i) => i.code === code));
	assert.ok(lint(badIface, {}, "systemverilog").issues.some((i) => i.code === code));
	assert.ok(!lint(good, {}, "systemverilog").issues.some((i) => i.code === code));
	assert.ok(!lint(plain, {}, "systemverilog").issues.some((i) => i.code === code));
	assert.ok(!lint(bad, {}, "verilog").issues.some((i) => i.code === code));
});
