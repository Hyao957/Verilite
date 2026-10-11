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
	assert.equal(outline.roots.length, 1);
	const m = outline.roots[0];
	assert.equal(m.name, "fifo");
	assert.equal(m.kind, "module");
	assert.equal(m.endLine, 10); // the `endmodule` line
	const memberNames = m.children.map((s) => s.name);
	for (const n of ["clk", "rst_n", "din", "dout", "DEPTH", "head", "tail", "empty"]) {
		assert.ok(memberNames.includes(n), `expected member ${n}`);
	}
});

test("outlineFile handles multiple modules", () => {
	const src = "module a;\n  wire x;\nendmodule\nmodule b;\n  wire y;\nendmodule\n";
	const outline = outlineFile(lex(src));
	assert.deepEqual(outline.roots.map((m) => m.name), ["a", "b"]);
	assert.deepEqual(outline.roots[0].children.map((s) => s.name), ["x"]);
	assert.deepEqual(outline.roots[1].children.map((s) => s.name), ["y"]);
});

test("outlineFile keeps stray symbols at the top level", () => {
	const src = "wire stray;\nmodule a;\n  wire x;\nendmodule\n";
	const outline = outlineFile(lex(src));
	assert.deepEqual(outline.roots.map((n) => n.name), ["stray", "a"]);
	assert.equal(outline.roots[0].kind, "signal");
	assert.deepEqual(outline.roots[1].children.map((s) => s.name), ["x"]);
});

test("outlineFile does not crash on an unclosed module", () => {
	const outline = outlineFile(lex("module a;\n  wire x;\n"));
	assert.equal(outline.roots.length, 1);
	assert.deepEqual(outline.roots[0].children.map((s) => s.name), ["x"]);
});

test("outlineFile nests class, interface and package members", () => {
	const src = [
		"package cfg_pkg;",
		"  typedef enum logic [1:0] { IDLE, RUN } state_t;",
		"endpackage",
		"interface bus_if;",
		"  logic clk;",
		"  modport master (output clk);",
		"endinterface",
		"class packet;",
		"  rand bit [7:0] data;",
		"  function void print();",
		"  endfunction",
		"endclass",
	].join("\n");
	const outline = outlineFile(lex(src, "systemverilog"), "systemverilog");

	assert.deepEqual(outline.roots.map((n) => n.name), ["cfg_pkg", "bus_if", "packet"]);
	const [pkg, iface, cls] = outline.roots;
	assert.equal(pkg.kind, "package");
	assert.equal(iface.kind, "interface");
	assert.equal(cls.kind, "type");
	assert.ok(pkg.children.some((c) => c.name === "state_t"));
	assert.ok(iface.children.some((c) => c.name === "clk"));
	assert.ok(iface.children.some((c) => c.name === "master"));
	assert.ok(cls.children.some((c) => c.name === "data"));
	assert.ok(cls.children.some((c) => c.name === "print"));
	// members must not leak to the top level
	const leaked = ["state_t", "clk", "master", "data", "print"];
	assert.deepEqual(outline.roots.filter((n) => leaked.includes(n.name)), []);
});

test("outlineFile ignores container keywords in the Verilog dialect", () => {
	const src = "class not_a_container;\n  wire x;\nendclass\n";
	const outline = outlineFile(lex(src, "verilog"), "verilog");
	assert.ok(!outline.roots.some((n) => n.name === "not_a_container"));
});

test("SystemVerilog built-in types are collected only in the SV dialect", () => {
        const src = [
                "module m(input byte unsigned data);",
                "  int errors;",
                "  string label;",
                "endmodule",
        ].join("\n");

        const svSymbols = scanSymbols(src, "systemverilog");
        const svNames = svSymbols.map((s) => s.name);
        assert.ok(svNames.includes("data"));
        assert.ok(svNames.includes("errors"));
        assert.ok(svNames.includes("label"));

        const verilogNames = scanSymbols(src, "verilog").map((s) => s.name);
        assert.ok(!verilogNames.includes("errors"));
        assert.ok(!verilogNames.includes("label"));
});

test("SystemVerilog typedef names and variables are collected", () => {
        const src = [
                "package types_pkg;",
                "  typedef enum logic [1:0] { IDLE, RUN } state_t;",
                "  state_t current_state, next_state;",
                "endpackage",
        ].join("\n");
        const symbols = scanSymbols(src, "systemverilog");
        const byName = new Map(symbols.map((s) => [s.name, s]));

        assert.equal(byName.get("state_t")?.kind, "type");
        assert.equal(byName.get("current_state")?.kind, "signal");
        assert.equal(byName.get("current_state")?.detail, "state_t");
        assert.equal(byName.get("next_state")?.kind, "signal");
});

test("multi-line struct typedef is offered as a type", () => {
	const src = [
		"typedef struct packed {",
		"  logic [7:0] data;",
		"  logic valid;",
		"} packet_t;",
		"packet_t request, response;",
	].join("\n");
	const symbols = scanSymbols(src, "systemverilog");
	const byName = new Map(symbols.map((s) => [s.name, s]));

	assert.equal(byName.get("packet_t")?.kind, "type");
	assert.equal(byName.get("request")?.detail, "packet_t");
	assert.equal(byName.get("response")?.kind, "signal");
	assert.ok(!byName.has("data_t"));
});

test("class names and class-typed variables are offered in SystemVerilog", () => {
	const src = [
		"class packet;",
		"  rand bit [7:0] data;",
		"endclass",
		"packet tx_packet;",
	].join("\n");
	const symbols = scanSymbols(src, "systemverilog");
	const byName = new Map(symbols.map((s) => [s.name, s]));

	assert.equal(byName.get("packet")?.kind, "type");
	assert.equal(byName.get("packet")?.detail, "class");
	assert.equal(byName.get("tx_packet")?.kind, "signal");
	assert.equal(byName.get("tx_packet")?.detail, "packet");

	const verilogNames = scanSymbols(src, "verilog").map((s) => s.name);
	assert.ok(!verilogNames.includes("packet"));
	assert.ok(!verilogNames.includes("tx_packet"));
});

test("class methods and inheritance are collected in SystemVerilog", () => {
	const src = [
		"class base;",
		"  function void print();",
		"  endfunction",
		"endclass",
		"class packet extends base;",
		"  function new();",
		"  endfunction",
		"  task drive(input int n);",
		"  endtask",
		"endclass",
	].join("\n");
	const byName = new Map(scanSymbols(src, "systemverilog").map((s) => [s.name, s]));

	assert.equal(byName.get("base")?.detail, "class");
	assert.equal(byName.get("packet")?.detail, "class extends base");
	assert.equal(byName.get("print")?.kind, "method");
	assert.equal(byName.get("new")?.kind, "method");
	assert.equal(byName.get("drive")?.kind, "method");

	const verilogNames = scanSymbols(src, "verilog").map((s) => s.name);
	assert.ok(!verilogNames.includes("packet"));
	assert.ok(!verilogNames.includes("print"));
	assert.ok(!verilogNames.includes("new"));
});

test("mailbox, semaphore and process are SystemVerilog declaration types", () => {
	const src = [
		"class tb;",
		"  mailbox   mbx;",
		"  semaphore sem;",
		"  process   thr;",
		"endclass",
	].join("\n");
	const byName = new Map(scanSymbols(src, "systemverilog").map((s) => [s.name, s]));

	assert.equal(byName.get("mbx")?.kind, "signal");
	assert.equal(byName.get("mbx")?.detail, "mailbox");
	assert.equal(byName.get("sem")?.detail, "semaphore");
	assert.equal(byName.get("thr")?.detail, "process");

	const verilogNames = scanSymbols(src, "verilog").map((s) => s.name);
	assert.ok(!verilogNames.includes("mbx"));
	assert.ok(!verilogNames.includes("sem"));
	assert.ok(!verilogNames.includes("thr"));
});

test("interface and modport declarations are collected in SystemVerilog", () => {
	const src = [
		"interface bus_if (input logic clk);",
		"  modport master (output clk);",
		"endinterface",
		"bus_if vif;",
	].join("\n");
	const byName = new Map(scanSymbols(src, "systemverilog").map((s) => [s.name, s]));

	assert.equal(byName.get("bus_if")?.kind, "interface");
	assert.equal(byName.get("master")?.kind, "modport");
	assert.equal(byName.get("vif")?.kind, "signal");
	assert.equal(byName.get("vif")?.detail, "bus_if");

	const verilogNames = scanSymbols(src, "verilog").map((s) => s.name);
	assert.ok(!verilogNames.includes("bus_if"));
	assert.ok(!verilogNames.includes("master"));
	assert.ok(!verilogNames.includes("vif"));
});

test("parameterized types declare the variable, not the type argument", () => {
	const src = [
		"class tb;",
		"  mailbox #(int) mbx;",
		"  pkg::driver#(int) drv;",
		"endclass",
	].join("\n");
	const byName = new Map(scanSymbols(src, "systemverilog").map((s) => [s.name, s]));

	assert.equal(byName.get("mbx")?.kind, "signal");
	assert.equal(byName.get("mbx")?.detail, "mailbox #(int)");
	assert.equal(byName.get("drv")?.kind, "signal");
	assert.equal(byName.get("drv")?.detail, "pkg::driver #(int)");
});

test("package-scoped types declare the variable name", () => {
	const src = [
		"class tb;",
		"  c_pkg::t_t x;",
		"  pkg::a::b v;",
		"endclass",
	].join("\n");
	const byName = new Map(scanSymbols(src, "systemverilog").map((s) => [s.name, s]));

	assert.equal(byName.get("x")?.kind, "signal");
	assert.equal(byName.get("x")?.detail, "c_pkg::t_t");
	assert.equal(byName.get("v")?.kind, "signal");
	assert.equal(byName.get("v")?.detail, "pkg::a::b");
});

test("enum members are collected as symbols", () => {
	const src = [
		"package cfg_pkg;",
		"  typedef enum logic [1:0] { IDLE, RUN = 2'b01, DONE } state_t;",
		"endpackage",
	].join("\n");
	const byName = new Map(scanSymbols(src, "systemverilog").map((s) => [s.name, s]));

	assert.equal(byName.get("IDLE")?.kind, "enumMember");
	assert.equal(byName.get("RUN")?.kind, "enumMember");
	assert.equal(byName.get("DONE")?.kind, "enumMember");
	assert.equal(byName.get("IDLE")?.detail, "state_t");
	assert.ok(!byName.has("b01")); // the initialiser is not a member

	const verilogNames = scanSymbols(src, "verilog").map((s) => s.name);
	assert.ok(!verilogNames.includes("IDLE"));
});

test("scope references are not mistaken for declarations", () => {
	const src = [
		"module m;",
		"  import pkg::*;",
		"  assign y = pkg::CONST;",
		'  initial uvm_config_db#(int)::set(null, "x", "y", 1);',
		"endmodule",
	].join("\n");
	const names = scanSymbols(src, "systemverilog").map((s) => s.name);

	assert.deepEqual(names, ["m"]);
});
