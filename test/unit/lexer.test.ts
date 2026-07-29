import assert from "node:assert/strict";
import { test } from "node:test";
import { lex } from "../../src/core/lexer";

test("masked mirror has the same length as the source", () => {
	const src = 'module a;\n  // begin end\n  reg x; /* "str" */\n  $display("hi // not a comment");\nendmodule\n';
	const r = lex(src);
	assert.equal(r.masked.length, src.length);
	assert.equal(r.maskedLines.length, r.rawLines.length);
});

test("keywords inside comments produce no tokens", () => {
	const r = lex("// begin end case endcase\nreg x;\n");
	const words = r.tokens.map((t) => t.lower);
	assert.ok(!words.includes("begin"));
	assert.ok(!words.includes("endcase"));
	assert.deepEqual(words, ["reg", "x", ";"]);
});

test("block comments span lines and mark lineStartsInBlockComment", () => {
	const r = lex("a\n/* begin\n   end */\nb\n");
	assert.equal(r.lineStartsInBlockComment[0], false);
	assert.equal(r.lineStartsInBlockComment[1], false);
	assert.equal(r.lineStartsInBlockComment[2], true);
	assert.equal(r.lineStartsInBlockComment[3], false);
	assert.ok(!r.tokens.some((t) => t.lower === "begin"));
});

test("// inside a string does not start a comment", () => {
	const r = lex('$display("a//b"); reg x;\n');
	assert.ok(r.tokens.some((t) => t.lower === "reg"));
	assert.equal(r.lineKinds[0], "code");
});

test("escaped quote does not end the string", () => {
	const r = lex('$display("a\\"b"); reg x;\n');
	assert.ok(r.tokens.some((t) => t.lower === "reg"));
	assert.equal(r.unterminatedString, null);
});

test("escaped identifiers become a single identifier token", () => {
	const r = lex("assign \\my$sig[0] = 1'b0;\n");
	const ids = r.tokens.filter((t) => t.kind === "identifier");
	assert.equal(ids.length, 1);
});

test("line kinds are classified", () => {
	const r = lex("\n// hello\n`define A 1\nreg x;\n");
	assert.deepEqual(r.lineKinds.slice(0, 4), ["blank", "comment", "directive", "code"]);
});

test("unterminated block comment and string are reported", () => {
	assert.notEqual(lex("a /* b\nc\n").unterminatedBlockComment, null);
	assert.notEqual(lex('$display("abc);\n').unterminatedString, null);
});

test("paren depth at line start is tracked", () => {
	const r = lex("module m #(\n  parameter W = 8\n)(\n  input clk\n);\n");
	assert.equal(r.parenDepthAtLineStart[0], 0);
	assert.equal(r.parenDepthAtLineStart[1], 1);
	assert.equal(r.parenDepthAtLineStart[3], 1);
	// line 4 is ");" - the port-list paren opened on line 2 is still open here
	assert.equal(r.parenDepthAtLineStart[4], 1);
	assert.equal(r.parenDepthAtLineStart[5], 0);
});

test("sized literals lex as one number token", () => {
	const r = lex("assign x = 8'hFF;\n");
	assert.ok(r.tokens.some((t) => t.kind === "number" && t.text === "8'hFF"));
});
