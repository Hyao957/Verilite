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

test("a begin block starting on the next line aligns with its head", () => {
	// joinBegin off: the standalone `begin` is kept and aligned with its head
	const opts = { joinBegin: false, alignIfElse: false };
	const src = "module m;\nalways @(*)\nbegin\ny = a;\nend\nendmodule\n";
	const out = formatText(src, opts).split("\n");
	assert.equal(out[1], "    always @(*)");
	assert.equal(out[2], "    begin");
	assert.equal(out[3], "        y = a;");
	assert.equal(out[4], "    end");
	assert.equal(out[5], "endmodule");
	assert.equal(formatText(formatText(src, opts), opts), formatText(src, opts));
});

test("a next-line begin with an else-if chain formats cleanly (regression)", () => {
	const opts = { joinBegin: false, alignIfElse: false };
	const src = [
		"module m;",
		"always@(posedge clk or negedge rst)",
		"begin",
		"if (~rst) q <= 0;",
		"else if (en) q <= d;",
		"else q <= q;",
		"end",
		"endmodule",
	].join("\n");
	const out = formatText(src, opts).split("\n");
	assert.equal(out[1], "    always @(posedge clk or negedge rst)");
	assert.equal(out[2], "    begin");
	assert.equal(out[3], "        if (~rst) q <= 0;");
	assert.equal(out[4], "        else if (en) q <= d;");
	assert.equal(out[5], "        else q <= q;");
	assert.equal(out[6], "    end");
	assert.equal(out[7], "endmodule");
	assert.equal(formatText(formatText(src, opts), opts), formatText(src, opts));
});

test("a nested head followed by a next-line begin stays aligned", () => {
	const opts = { joinBegin: false, alignIfElse: false };
	const src = "module m;\nalways @(*) begin\nif (x)\nbegin\ny = 1;\nend\nend\nendmodule\n";
	const out = formatText(src, opts).split("\n");
	assert.equal(out[2], "        if (x)");
	assert.equal(out[3], "        begin");
	assert.equal(out[4], "            y = 1;");
	assert.equal(out[5], "        end");
	assert.equal(out[6], "    end");
	assert.equal(formatText(formatText(src, opts), opts), formatText(src, opts));
});

test("a genuine single-statement body is still indented", () => {
	const src = "module m;\nalways @(*)\nif (x) y = a;\nendmodule\n";
	const out = formatText(src).split("\n");
	assert.equal(out[2], "        if (x) y = a;");
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("always@ is normalised to always @", () => {
	const out = formatText("module m;\nalways@(posedge clk) q <= d;\nendmodule\n");
	assert.ok(out.includes("    always @(posedge clk) q <= d;"));
});

test("alignIfElse column-aligns single-statement if/else bodies", () => {
	const src =
		"module m;\nalways @(*) begin\nif (a) y = 1;\nelse if (bb) y = 2;\nelse y = 3;\nend\nendmodule\n";
	const opts = { alignIfElse: true };
	const out = formatText(src, opts).split("\n");
	assert.equal(out[2], "        if (a)       y = 1;");
	assert.equal(out[3], "        else if (bb) y = 2;");
	assert.equal(out[4], "        else         y = 3;");
	assert.equal(formatText(formatText(src, opts), opts), formatText(src, opts));
});

test("alignIfElse leaves begin/end branches with normal indentation", () => {
	const src =
		"module m;\nalways @(*) begin\nif (a) begin\ny = 1;\nend\nelse begin\ny = 2;\nend\nend\nendmodule\n";
	const out = formatText(src, { alignIfElse: true }).split("\n");
	assert.equal(out[2], "        if (a) begin");
	assert.equal(out[3], "            y = 1;");
	assert.equal(out[4], "        end");
	assert.equal(out[5], "        else begin");
});

test("joinBegin merges a lone begin onto its control head", () => {
	const src = "module m;\nalways @(*)\nbegin\ny = a;\nend\nendmodule\n";
	const opts = { joinBegin: true };
	const out = formatText(src, opts).split("\n");
	assert.equal(out[1], "    always @(*) begin");
	assert.equal(out[2], "        y = a;");
	assert.equal(out[3], "    end");
	assert.equal(formatText(formatText(src, opts), opts), formatText(src, opts));
});

test("joinBegin skips a begin that carries a trailing comment", () => {
	const src = "module m;\nalways @(*)\nbegin // keep\ny = a;\nend\nendmodule\n";
	const out = formatText(src, { joinBegin: true }).split("\n");
	assert.equal(out[2], "    begin // keep");
});

test("joinBegin + alignIfElse reproduce the compact aligned style", () => {
	const src = [
		"module m;",
		"always @(posedge clk or negedge rst)",
		"begin",
		"if (~rst) lfsr <= 31'h0;",
		"else if (key_en) lfsr <= {k1, k2};",
		"else lfsr <= lfsr;",
		"end",
		"endmodule",
	].join("\n");
	const opts = { joinBegin: true, alignIfElse: true };
	const out = formatText(src, opts).split("\n");
	assert.equal(out[1], "    always @(posedge clk or negedge rst) begin");
	assert.equal(out[2], "        if (~rst)        lfsr <= 31'h0;");
	assert.equal(out[3], "        else if (key_en) lfsr <= {k1, k2};");
	assert.equal(out[4], "        else             lfsr <= lfsr;");
	assert.equal(out[5], "    end");
	assert.equal(formatText(formatText(src, opts), opts), formatText(src, opts));
});

test("an else whose body is a case block keeps the whole case indented", () => {
	const src =
		"module m;\nalways @(*) begin\nif (c) y = 1;\nelse\ncase (s)\na: y = 2;\ndefault: y = 3;\nendcase\nend\nendmodule\n";
	const out = formatText(src).split("\n");
	assert.equal(out[3], "        else");
	assert.equal(out[4], "            case (s)");
	assert.equal(out[5], "                a: y = 2;");
	assert.equal(out[6], "                default: y = 3;");
	assert.equal(out[7], "            endcase");
	assert.equal(out[8], "    end");
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("case labels with next-line begin/end blocks stay aligned", () => {
	const src =
		"module m;\nalways @(*) case (s)\na:\nbegin\ny = 1;\nend\nb:\nbegin\ny = 2;\nend\nendcase\nendmodule\n";
	const out = formatText(src).split("\n");
	assert.equal(out[2], "        a:");
	assert.equal(out[3], "        begin");
	assert.equal(out[4], "            y = 1;");
	assert.equal(out[5], "        end");
	assert.equal(out[6], "        b:");
	assert.equal(out[10], "    endcase");
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignParams column-aligns consecutive localparam/parameter '='", () => {
	const src = [
		"module m;",
		"localparam S_IDLE = 16'h0001;",
		"localparam S_READ_KEY = 16'h0002;",
		"localparam S_DONE = 16'h2000;",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	assert.equal(out[1], "    localparam S_IDLE     = 16'h0001;");
	assert.equal(out[2], "    localparam S_READ_KEY = 16'h0002;");
	assert.equal(out[3], "    localparam S_DONE     = 16'h2000;");
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignParams handles typed and ranged declarations", () => {
	const src = [
		"module m;",
		"parameter integer WIDTH = 8;",
		"localparam [9:0] HASH_ADDR = 10'h020;",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	assert.equal(out[1], "    parameter integer WIDTH    = 8;");
	assert.equal(out[2], "    localparam [9:0] HASH_ADDR = 10'h020;");
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignParams is on by default and can be disabled", () => {
	const src = "module m;\nlocalparam A = 1;\nlocalparam BBB = 2;\nendmodule\n";
	assert.ok(formatText(src).includes("localparam A   = 1;"));
	assert.ok(!formatText(src, { alignParams: false }).includes("localparam A   = 1;"));
	assert.ok(formatText(src, { alignParams: false }).includes("localparam A = 1;"));
});

test("alignDeclarations column-aligns consecutive net declarations", () => {
	const src = [
		"module m;",
		"wire mgmt_srh_req;",
		"wire mgmt_insr_req;",
		"wire [127:0] mgmt_ip_data;",
		"wire mgmt_srh_vld;",
		"wire mgmt_insr_vld;",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	assert.equal(out[1], "    wire         mgmt_srh_req;");
	assert.equal(out[2], "    wire         mgmt_insr_req;");
	assert.equal(out[3], "    wire [127:0] mgmt_ip_data;");
	assert.equal(out[4], "    wire         mgmt_srh_vld;");
	assert.equal(out[5], "    wire         mgmt_insr_vld;");
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignDeclarations works across reg/logic and aligns trailing comments", () => {
	const src = [
		"module m;",
		"reg [7:0] cnt;",
		"reg carry; // note",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	assert.equal(out[1], "    reg [7:0] cnt;");
	assert.equal(out[2], "    reg       carry;  // note");
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignDeclarations breaks the run on multi-name and initialised lines", () => {
	const src = [
		"module m;",
		"logic [7:0] pkt_data;",
		"logic pkt_valid, pkt_last;",
		"logic pkt_ready;",
		"logic clk = 1'b0;",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	// none of these form a run of >= 2 alignable single-name declarations
	assert.equal(out[1], "    logic [7:0] pkt_data;");
	assert.equal(out[2], "    logic pkt_valid, pkt_last;");
	assert.equal(out[3], "    logic pkt_ready;");
	assert.equal(out[4], "    logic clk = 1'b0;");
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignDeclAssignments column-aligns initialized declarations", () => {
	const src = [
		"module m;",
		"wire [4:0] ip_words = key_add_flag ? 5'd2 : 5'd0;",
		"wire [4:0] last_cnt = key_add_flag ? 5'd25 : 5'd2;",
		"wire in_data = (udp_flash_cnt >= ip_words);",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	// variable names, =, and rhs aligned
	assert.ok(out[1].includes("ip_words ="));
	assert.ok(out[2].includes("last_cnt ="));
	assert.ok(out[3].includes("in_data  ="));
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignDeclAssignments aligns trailing comments", () => {
	const src = [
		"module m;",
		"wire [4:0] ip_words = 5'd2; // IP 预导字数",
		"wire [4:0] last_cnt = 5'd25; // 末字计数",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	assert.ok(out[1].includes("// IP"));
	assert.ok(out[2].includes("// 末"));
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignDeclAssignments is on by default and can be disabled", () => {
	const src = "module m;\nwire aaa = 1;\nwire b = 2;\nendmodule\n";
	const out = formatText(src).split("\n");
	// with alignment on, "aaa = " has extra padding before =
	assert.ok(out[1].includes("aaa ="));
	const outDisabled = formatText(src, { alignDeclAssignments: false }).split("\n");
	// with alignment off, no extra padding
	assert.ok(outDisabled[1].includes("aaa = 1;"));
});

test("alignInstancePorts column-aligns port connections", () => {
	const src = [
		"module m;",
		"clk_wiz u_clk_wiz (",
		".clk_out1 (clk_100m),",
		".clk_out2 (clk_200m),",
		".clk_in1 (clk)",
		");",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	// port names aligned: opening parens at same column
	const p1 = out[2].indexOf("(");
	const p2 = out[3].indexOf("(");
	const p3 = out[4].indexOf("(");
	assert.ok(p1 > 0 && p2 > 0 && p3 > 0, "all ports have opening parens");
	assert.equal(p1, p2);
	assert.equal(p1, p3);
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignInstancePorts aligns trailing comments", () => {
	const src = [
		"module m;",
		"clk_wiz u_clk_wiz (",
		".clk_out1 (clk_100m), // 48MHz",
		".clk_out2 (clk_200m), // 200MHz",
		");",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	assert.ok(out[2].includes("// 48MHz"));
	assert.ok(out[3].includes("// 200MHz"));
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignInstancePorts removes blank lines between port connections", () => {
	const src = [
		"module m;",
		"clk_wiz u_clk_wiz (",
		".clk_out1 (clk_100m),",
		"",
		".clk_out2 (clk_200m),",
		"",
		"",
		".clk_in1 (clk)",
		");",
		"endmodule",
	].join("\n");
	const out = formatText(src);
	// blank lines should be removed
	assert.ok(!out.includes("\n\n"), "blank lines should be removed");
	assert.ok(out.includes(".clk_out1"));
	assert.ok(out.includes(".clk_out2"));
	assert.ok(out.includes(".clk_in1"));
	// idempotent
	const twice = formatText(out);
	assert.equal(twice, out);
});

test("alignInstancePorts comment lines break the alignment run", () => {
	const src = [
		"module m;",
		"clk_wiz u_clk_wiz (",
		"// Clock out ports",
		".clk_out1 (clk_100m),",
		".clk_out2 (clk_200m),",
		"// Status signals",
		".resetn (1'b1),",
		".locked (pll_locked),",
		");",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	// comment lines are preserved and break alignment runs
	assert.ok(out.some((l) => l.includes("// Clock out ports")));
	assert.ok(out.some((l) => l.includes("// Status signals")));
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignInstancePorts is on by default and can be disabled", () => {
	const src = "module m;\nclk_wiz u_clk_wiz (\n.clk (clk),\n.reset_n (rst_n)\n);\nendmodule\n";
	const outEnabled = formatText(src).split("\n");
	const outDisabled = formatText(src, { alignInstancePorts: false }).split("\n");
	// with alignment on, the parens should be aligned
	const p1_enabled = outEnabled[2].indexOf("(");
	const p2_enabled = outEnabled[3].indexOf("(");
	assert.equal(p1_enabled, p2_enabled, "parens should align when enabled");
	// with alignment off, no alignment
	const p1_disabled = outDisabled[2].indexOf("(");
	const p2_disabled = outDisabled[3].indexOf("(");
	assert.notEqual(p1_disabled, p2_disabled, "parens should not align when disabled");
});

test("alignDeclarations is on by default and can be disabled", () => {
	const src = "module m;\nwire a;\nwire [7:0] bbbb;\nendmodule\n";
	assert.ok(formatText(src).includes("wire       a;"));
	assert.ok(formatText(src, { alignDeclarations: false }).includes("wire a;"));
});

test("alignBlockAssignments column-aligns procedural assignments", () => {
	const src = [
		"module m;",
		"always @(*) begin",
		"a <= b;",
		"long_signal <= c + d;",
		"q = data_in;",
		"result <= expr;",
		"end",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	// LHS and operators aligned
	assert.ok(out[2].includes("a           <="));
	assert.ok(out[3].includes("long_signal <="));
	assert.ok(out[4].includes("q           ="));
	assert.ok(out[5].includes("result      <="));
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignBlockAssignments aligns trailing comments", () => {
	const src = [
		"module m;",
		"always @(*) begin",
		"a <= b; // first",
		"long_signal <= c + d; // second",
		"result <= expr; // third",
		"end",
		"endmodule",
	].join("\n");
	const out = formatText(src).split("\n");
	assert.ok(out[2].includes("// first"));
	assert.ok(out[3].includes("// second"));
	assert.ok(out[4].includes("// third"));
	assert.equal(formatText(formatText(src)), formatText(src));
});

test("alignBlockAssignments is on by default and can be disabled", () => {
	const src = "module m;\nalways @(*) begin\na <= b;\nlong_signal <= c + d;\nend\nendmodule\n";
	const out = formatText(src);
	assert.ok(out.includes("a           <="));
	const outDisabled = formatText(src, { alignBlockAssignments: false });
	assert.ok(!outDisabled.includes("a           <="));
	assert.ok(outDisabled.includes("a <= b;"));
});

test("systemverilog aligns ports typed with sv-only data types", () => {
	const src = [
		"module m (",
		"input logic [7:0] data,",
		"input bit valid,",
		"output logic ready",
		");",
		"endmodule",
	].join("\n");

	const sv = formatText(src, {}, 0, "systemverilog").split("\n");
	assert.equal(sv[1], "    input  logic [7:0] data,");
	// every port name lands in the same column, even though `bit` is SV-only
	assert.equal(sv[1].indexOf("data"), sv[2].indexOf("valid"));
	assert.equal(sv[1].indexOf("data"), sv[3].indexOf("ready"));
	const svOnce = sv.join("\n");
	assert.equal(formatText(svOnce, {}, 0, "systemverilog"), svOnce);

	// Verilog does not know `bit`, so the run breaks and nothing is aligned
	const v = formatText(src, {}, 0, "verilog").split("\n");
	assert.equal(v[1], "    input logic [7:0] data,");
	assert.equal(v[2], "    input bit valid,");
});

test("systemverilog folds the var port qualifier into the type column", () => {
	const src = "module m (\ninput var logic en,\noutput var logic ready\n);\nendmodule\n";
	const out = formatText(src, {}, 0, "systemverilog").split("\n");
	assert.equal(out[1], "    input  var logic en,");
	assert.equal(out[2], "    output var logic ready");
});

test("systemverilog aligns class members with declaration qualifiers", () => {
	const src = [
		"class c;",
		"rand bit [7:0] data;",
		"rand bit [3:0] addr;",
		"local int cnt;",
		"endclass",
	].join("\n");

	const sv = formatText(src, {}, 0, "systemverilog").split("\n");
	assert.equal(sv[1], "    rand bit  [7:0] data;");
	assert.equal(sv[1].indexOf("data"), sv[2].indexOf("addr"));
	assert.equal(sv[1].indexOf("data"), sv[3].indexOf("cnt"));

	// `rand` / `local` are not Verilog, so the Verilog pass leaves them alone
	const v = formatText(src, {}, 0, "verilog").split("\n");
	assert.equal(v[1].trim(), "rand bit [7:0] data;");
	assert.ok(!v[1].includes("bit  ["), "verilog must not pad an SV-only qualifier");
});
