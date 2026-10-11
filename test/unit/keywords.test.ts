import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BLOCK_PAIRS,
	CLOSER_TO_OPENERS,
	CONTROL_KEYWORDS,
	DATA_TYPES,
	DECLARATION_STARTERS,
	DIRECTIVES,
	INDENT_CLOSERS,
	INDENT_OPENERS,
	KEYWORD_DOCS,
	KEYWORD_SET,
	SINGLE_STATEMENT_HEADS_BASE,
	STATEMENT_STARTERS,
	SYSTEM_TASKS,
	indentPairsFor,
	keywordsFor,
	systemTasksFor,
} from "../../src/core/keywords";

function sameSet(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) return false;
	for (const x of a) if (!b.has(x)) return false;
	return true;
}

test("keywordsFor('verilog') reproduces the legacy keyword sets exactly", () => {
	const k = keywordsFor("verilog");
	assert.deepEqual(k.control, CONTROL_KEYWORDS);
	assert.deepEqual(k.dataTypes, DATA_TYPES);
	assert.deepEqual(k.directives, DIRECTIVES);
	assert.deepEqual(k.docs, KEYWORD_DOCS);
	assert.ok(sameSet(k.set, KEYWORD_SET));
});

test("indentPairsFor('verilog') reproduces the legacy indent tables exactly", () => {
	const p = indentPairsFor("verilog");
	assert.deepEqual(p.blockPairs, BLOCK_PAIRS);
	assert.deepEqual(p.closerToOpeners, CLOSER_TO_OPENERS);
	assert.ok(sameSet(p.indentOpeners, INDENT_OPENERS));
	assert.ok(sameSet(p.indentClosers, INDENT_CLOSERS));
	assert.ok(sameSet(p.statementStarters, STATEMENT_STARTERS));
	assert.ok(sameSet(p.declarationStarters, DECLARATION_STARTERS));
	assert.ok(sameSet(p.singleStatementHeads, new Set(SINGLE_STATEMENT_HEADS_BASE)));
});

test("systemTasksFor('verilog') reproduces the legacy task list exactly", () => {
	assert.deepEqual(systemTasksFor("verilog"), SYSTEM_TASKS);
});

test("systemverilog is a strict superset of verilog", () => {
	const vk = keywordsFor("verilog").set;
	const sk = keywordsFor("systemverilog").set;
	for (const w of vk) assert.ok(sk.has(w), `sv missing verilog keyword ${w}`);
	for (const w of ["interface", "typedef", "class", "package", "enum", "bit", "int"]) {
		assert.ok(sk.has(w), `sv should add ${w}`);
		assert.ok(!vk.has(w), `verilog should not have ${w}`);
	}

	const vt = new Set(systemTasksFor("verilog"));
	const st = new Set(systemTasksFor("systemverilog"));
	assert.ok(st.has("$cast") && !vt.has("$cast"));

	const sp = indentPairsFor("systemverilog");
	assert.ok(sp.indentClosers.has("endinterface"));
	assert.deepEqual(sp.blockPairs.interface, ["endinterface"]);
	assert.deepEqual(sp.closerToOpeners["endinterface"], ["interface"]);
	assert.ok(sp.singleStatementHeads.has("foreach"));
});

test("SystemVerilog-only completions do not leak into Verilog", () => {
	const verilogKeywords = keywordsFor("verilog").set;
	const systemVerilogKeywords = keywordsFor("systemverilog").set;
	for (const word of [
		"logic", "always_ff", "always_comb", "interface", "class", "join_any",
		"mailbox", "semaphore", "process",
	]) {
		assert.ok(!verilogKeywords.has(word), `verilog should not offer ${word}`);
		assert.ok(systemVerilogKeywords.has(word), `systemverilog should offer ${word}`);
	}

	const verilogTasks = new Set(systemTasksFor("verilog"));
	const systemVerilogTasks = new Set(systemTasksFor("systemverilog"));
	for (const task of ["$urandom", "$clog2", "$bits", "$fatal"]) {
		assert.ok(!verilogTasks.has(task), `verilog should not offer ${task}`);
		assert.ok(systemVerilogTasks.has(task), `systemverilog should offer ${task}`);
	}
});

test("accessors return stable (memoized) objects", () => {
	assert.equal(keywordsFor("verilog"), keywordsFor("verilog"));
	assert.equal(indentPairsFor("systemverilog"), indentPairsFor("systemverilog"));
	assert.equal(systemTasksFor("verilog"), systemTasksFor("verilog"));
});
