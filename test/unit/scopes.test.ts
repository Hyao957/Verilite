import assert from "node:assert/strict";
import { test } from "node:test";
import { lex } from "../../src/core/lexer";
import { buildScopeIndex } from "../../src/engine/scopes";

const SRC = [
	"package cfg_pkg;",
	"  typedef enum logic [1:0] { IDLE, RUN = 2'b01, DONE } state_t;",
	"endpackage",
	"interface bus_if (input logic clk);",
	"  logic valid;",
	"  modport master (output clk);",
	"endinterface",
	"class packet;",
	"  rand bit [7:0] data;",
	"  function void print(); endfunction",
	"endclass",
].join("\n");

test("container members are indexed for scoped completion", () => {
	const index = buildScopeIndex(lex(SRC, "systemverilog"), "systemverilog");
	const names = (container: string) => (index.containers.get(container) ?? []).map((s) => s.name);

	assert.deepEqual(names("cfg_pkg"), ["IDLE", "RUN", "DONE", "state_t"]);
	assert.ok(names("bus_if").includes("clk"));
	assert.ok(names("bus_if").includes("valid"));
	assert.ok(names("bus_if").includes("master"));
	assert.deepEqual(names("packet"), ["data", "print"]);

	// spans drive enclosing-scope queries
	const spans = index.spans.map((s) => s.name);
	assert.deepEqual(spans, ["cfg_pkg", "bus_if", "packet"]);
});

test("enum members are indexed by their type name", () => {
	const index = buildScopeIndex(lex(SRC, "systemverilog"), "systemverilog");
	const members = index.enums.get("state_t") ?? [];
	assert.deepEqual(members.map((s) => s.name), ["IDLE", "RUN", "DONE"]);
	assert.ok(members.every((s) => s.kind === "enumMember"));
});

test("a struct typedef is a leaf, not a scope", () => {
	const src = "package p;\n  typedef struct packed { logic a; } pair_t;\nendpackage\n";
	const index = buildScopeIndex(lex(src, "systemverilog"), "systemverilog");
	assert.ok(!index.spans.some((s) => s.name === "pair_t"));
});

test("the verilog dialect exposes modules but no enums", () => {
	const src = "module m;\n  wire x;\nendmodule\n";
	const index = buildScopeIndex(lex(src, "verilog"), "verilog");
	assert.deepEqual(index.containers.get("m")?.map((s) => s.name), ["x"]);
	assert.equal(index.enums.size, 0);
});