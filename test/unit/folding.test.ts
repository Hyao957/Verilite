import assert from "node:assert/strict";
import { test } from "node:test";
import { foldRegions } from "../../src/engine/folding";

test("block keywords fold to their matching end keyword", () => {
	const src = [
		"module m;", // 0
		"  always @(*) begin", // 1
		"    case (x)", // 2
		"      1: y = 0;", // 3
		"    endcase", // 4
		"  end", // 5
		"endmodule", // 6
	].join("\n");

	assert.deepEqual(foldRegions(src), [
		{ start: 0, end: 6 },
		{ start: 1, end: 5 },
		{ start: 2, end: 4 },
	]);
});

test("SystemVerilog containers fold and nest", () => {
	const src = [
		"package p;", // 0
		"  class c;", // 1
		"  endclass", // 2
		"endpackage", // 3
	].join("\n");

	assert.deepEqual(foldRegions(src, "systemverilog"), [
		{ start: 0, end: 3 },
		{ start: 1, end: 2 },
	]);
});

test("fork/join_any and randcase fold in SystemVerilog", () => {
	const src = [
		"module m;", // 0
		"  initial fork", // 1
		"  join_any", // 2
		"  randcase", // 3
		"  endcase", // 4
		"endmodule", // 5
	].join("\n");

	assert.deepEqual(foldRegions(src, "systemverilog"), [
		{ start: 0, end: 5 },
		{ start: 1, end: 2 },
		{ start: 3, end: 4 },
	]);
});

test("compiler directives fold", () => {
	const src = [
		"`ifdef SIM", // 0
		"  wire a;", // 1
		"`else", // 2
		"  wire b;", // 3
		"`endif", // 4
	].join("\n");

	assert.deepEqual(foldRegions(src), [{ start: 0, end: 4 }]);
});

test("runs of consecutive comment lines fold", () => {
	const src = [
		"// one", // 0
		"// two", // 1
		"wire a;", // 2
		"// lone", // 3
		"wire b;", // 4
	].join("\n");

	assert.deepEqual(foldRegions(src), [{ start: 0, end: 1, kind: "comment" }]);
});

test("single-line blocks and lone comments do not fold", () => {
	assert.deepEqual(foldRegions("module m; endmodule\n"), []);
	assert.deepEqual(foldRegions("wire a;\n// lone\nwire b;\n"), []);
});

test("SystemVerilog-only containers do not fold in the Verilog dialect", () => {
	const src = "class c;\nendclass\n";
	assert.deepEqual(foldRegions(src, "verilog"), []);
	assert.deepEqual(foldRegions(src, "systemverilog"), [{ start: 0, end: 1 }]);
});