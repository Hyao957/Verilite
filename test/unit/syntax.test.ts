import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

interface GrammarPattern {
        include?: string;
        match?: string;
        patterns?: GrammarPattern[];
}

interface Grammar {
        scopeName: string;
        patterns: GrammarPattern[];
        repository: Record<string, GrammarPattern>;
}

interface Snippet {
	prefix: string;
	body: string | string[];
	description: string;
}

const root = path.join(__dirname, "..", "..", "..");
const grammarPath = path.join(root, "syntaxes", "systemverilog.tmLanguage.json");
const grammar = JSON.parse(fs.readFileSync(grammarPath, "utf8")) as Grammar;
const verilogGrammar = JSON.parse(
	fs.readFileSync(path.join(root, "syntaxes", "verilog.tmLanguage.json"), "utf8"),
) as Grammar;

function repositoryMatch(name: string, sourceGrammar: Grammar = grammar): RegExp {
	const entry = sourceGrammar.repository[name];
        assert.ok(entry, `missing grammar repository entry ${name}`);
        const source = entry.match ?? entry.patterns?.map((p) => p.match ?? "").join("|");
        assert.ok(source, `grammar repository entry ${name} has no match`);
        return new RegExp(source);
}

test("SystemVerilog grammar applies overrides before the Verilog fallback", () => {
        assert.equal(grammar.scopeName, "source.systemverilog");
        assert.equal(grammar.patterns.at(-1)?.include, "source.verilog");
	assert.ok(grammar.patterns.some((pattern) => pattern.include === "#sv-declarations"));
});

test("SystemVerilog grammar covers declarations, assertions and operators", () => {
        assert.match("class packet;", repositoryMatch("sv-declarations"));
        assert.match("bit valid;", repositoryMatch("sv-types"));
        assert.match("assert property (req |-> ##1 ack);", repositoryMatch("sv-assertions"));
        assert.match("pkg::item", repositoryMatch("sv-operators"));
});

test("SystemVerilog-only tokens are absent from the Verilog highlighting rules", () => {
	assert.doesNotMatch("logic", repositoryMatch("storage-types", verilogGrammar));
	assert.doesNotMatch("always_ff", repositoryMatch("keywords", verilogGrammar));
	assert.match("logic", repositoryMatch("sv-types"));
	assert.match("always_ff", repositoryMatch("sv-keywords"));
});

test("Verilog and SystemVerilog use independent snippet files", () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
		contributes: { snippets: Array<{ language: string; path: string }> };
	};
	const verilogPaths = manifest.contributes.snippets
		.filter((entry) => entry.language === "verilog")
		.map((entry) => entry.path);
	const systemVerilogPaths = manifest.contributes.snippets
		.filter((entry) => entry.language === "systemverilog")
		.map((entry) => entry.path);

	assert.ok(verilogPaths.includes("./snippets/verilog.json"));
	assert.deepEqual(systemVerilogPaths, ["./snippets/systemverilog.json"]);
	assert.ok(!verilogPaths.includes(systemVerilogPaths[0]));
});

test("SystemVerilog snippets provide common and SV-only completions", () => {
	const verilog = JSON.parse(
		fs.readFileSync(path.join(root, "snippets", "verilog.json"), "utf8"),
	) as Record<string, Snippet>;
	const systemVerilog = JSON.parse(
		fs.readFileSync(path.join(root, "snippets", "systemverilog.json"), "utf8"),
	) as Record<string, Snippet>;

	const svPrefixes = new Set(Object.values(systemVerilog).map((snippet) => snippet.prefix));
	for (const prefix of ["module", "function", "task", "tb", "always_ff", "interface", "typedefenum", "assertp"]) {
		assert.ok(svPrefixes.has(prefix), `SystemVerilog snippets should include ${prefix}`);
	}

	const verilogPrefixes = new Set(Object.values(verilog).map((snippet) => snippet.prefix));
	for (const prefix of ["always_ff", "interface", "typedefenum", "assertp"]) {
		assert.ok(!verilogPrefixes.has(prefix), `Verilog snippets should not include ${prefix}`);
	}
});
