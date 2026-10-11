import assert from "node:assert/strict";
import { test } from "node:test";
import { AnalysisCache } from "../../src/engine/analysis";
import type { DocumentAnalysis } from "../../src/engine/analysis";

const SRC = "module fifo;\n  wire empty;\nendmodule\n";

test("AnalysisCache reuses the entry while the version is unchanged", () => {
	const cache = new AnalysisCache("verilog");
	const first = cache.get("u", 1, SRC);
	const second = cache.get("u", 1, SRC);

	assert.equal(first, second);
	assert.ok(first.lexed.tokens.length > 0);
	assert.equal(first.symbols.find((s) => s.kind === "module")?.name, "fifo");
});

test("AnalysisCache re-analyzes when the version changes", () => {
	const cache = new AnalysisCache("verilog");
	const first = cache.get("u", 1, "module a;\nendmodule\n");
	const second = cache.get("u", 2, "module b;\nendmodule\n");

	assert.notEqual(first, second);
	assert.equal(second.symbols.find((s) => s.kind === "module")?.name, "b");
});

test("AnalysisCache keys entries per document", () => {
	const cache = new AnalysisCache("verilog");
	const a = cache.get("a", 1, "module ma;\nendmodule\n");
	const b = cache.get("b", 1, "module mb;\nendmodule\n");

	assert.notEqual(a, b);
	assert.equal(a.symbols.find((s) => s.kind === "module")?.name, "ma");
	assert.equal(b.symbols.find((s) => s.kind === "module")?.name, "mb");
});

test("AnalysisCache.forget drops a single entry", () => {
	const cache = new AnalysisCache("verilog");
	const first = cache.get("u", 1, SRC);
	cache.forget("u");
	const second = cache.get("u", 1, SRC);

	assert.notEqual(first, second);
});

test("AnalysisCache.clear drops every entry", () => {
	const cache = new AnalysisCache("verilog");
	const first: DocumentAnalysis = cache.get("u", 1, SRC);
	cache.clear();

	assert.notEqual(cache.get("u", 1, SRC), first);
});

test("AnalysisCache analyses with the configured dialect", () => {
	const cache = new AnalysisCache("systemverilog");
	const analysis = cache.get("u", 1, "class packet;\nendclass\n");

	assert.equal(analysis.symbols.find((s) => s.kind === "type")?.name, "packet");
});