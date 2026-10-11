import assert from "node:assert/strict";
import { test } from "node:test";
import { lex } from "../../src/core/lexer";
import { formatText } from "../../src/engine/format";
import { LINT_RULES, lint, lintLexed } from "../../src/engine/lint";
import type { LintRule } from "../../src/engine/lint";

test("lexer classifies SystemVerilog-only keywords per dialect", () => {
	assert.equal(lex("interface i;").tokens.find((t) => t.text === "interface")!.kind, "identifier");
	assert.equal(
		lex("interface i;", "systemverilog").tokens.find((t) => t.text === "interface")!.kind,
		"keyword",
	);
});

test("indent pairs interface/endinterface only for systemverilog", () => {
	const src = "interface i;\nlogic x;\nendinterface\n";
	assert.equal(formatText(src), "interface i;\nlogic x;\nendinterface\n");
	assert.equal(formatText(src, {}, 0, "systemverilog"), "interface i;\n    logic x;\nendinterface\n");
});

test("formatText is idempotent for systemverilog", () => {
	const src = "interface i;\nlogic x;\nalways_comb begin\ny = x;\nend\nendinterface\n";
	const once = formatText(src, {}, 0, "systemverilog");
	assert.equal(formatText(once, {}, 0, "systemverilog"), once);
});

test("lint scheduler filters rules by dialect", () => {
	const marker: LintRule = {
		name: "sv-marker",
		dialects: ["systemverilog"],
		run: () => [{ line: 0, col: 0, endCol: 1, severity: "hint", code: "sv-marker", message: "sv only" }],
	};
	const rules = [...LINT_RULES, marker];
	const src = "module m;\nendmodule\n";
	const asVerilog = lintLexed(lex(src), {}, "verilog", rules);
	const asSv = lintLexed(lex(src, "systemverilog"), {}, "systemverilog", rules);
	assert.ok(!asVerilog.issues.some((i) => i.code === "sv-marker"));
	assert.ok(asSv.issues.some((i) => i.code === "sv-marker"));
});

test("built-in rules are scoped to real dialects", () => {
	assert.ok(LINT_RULES.every((r) => r.dialects.length > 0));
	// Rules that skip Verilog must be exactly the SystemVerilog-only extras.
	const svOnly = LINT_RULES.filter((r) => !r.dialects.includes("verilog"));
	assert.ok(svOnly.every((r) => r.dialects.includes("systemverilog")));
});

test("lint accepts a dialect argument", () => {
	const r = lint("module m;\nendmodule\n", {}, "systemverilog");
	assert.equal(r.issues.filter((i) => i.severity === "error").length, 0);
});

test("SystemVerilog randcase and randsequence blocks are paired", () => {
        const src = [
                "module m;",
                "  initial randcase",
                "    1: a = 1;",
                "  endcase",
                "  randsequence(main)",
                "    main: item;",
                "    item: a = 1;",
                "  endsequence",
                "endmodule",
        ].join("\n");
        const result = lint(src, {}, "systemverilog");
        assert.deepEqual(result.issues.filter((i) => i.code.startsWith("pair-")), []);
});

test("missing semicolon checks SystemVerilog scalar declarations", () => {
        const src = "module m;\n  int count\n  logic done;\nendmodule\n";
        const result = lint(src, {}, "systemverilog");
        assert.ok(result.issues.some((i) => i.code === "missing-semicolon" && i.line === 1));
});

test("extern class methods do not require endfunction", () => {
	const src = "class packet;\n  extern function void print();\nendclass\n";
	const result = lint(src, {}, "systemverilog");
	assert.deepEqual(result.issues.filter((i) => i.code.includes("pair") || i.code === "missing-closer"), []);
	assert.equal(
		formatText(src, {}, 0, "systemverilog"),
		"class packet;\n    extern function void print();\nendclass\n",
	);
});

test("multi-line interface headers use one hanging indent", () => {
	const src = [
		"interface bus_if (",
		"input logic clk,",
		"input logic rst_n",
		");",
		"logic valid;",
		"endinterface",
		"",
	].join("\n");
	const expected = [
		"interface bus_if (",
		"    input logic clk,",
		"    input logic rst_n",
		");",
		"    logic valid;",
		"endinterface",
		"",
	].join("\n");
	assert.equal(formatText(src, {}, 0, "systemverilog"), expected);
});
