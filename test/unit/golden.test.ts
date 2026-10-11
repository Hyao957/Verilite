import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { formatText } from "../../src/engine/format";
import { lint } from "../../src/engine/lint";

/**
 * Byte-for-byte guard: the dual-dialect refactor must not change the formatting
 * or lint output for pure Verilog. The golden snapshots in test/golden/ were
 * captured from the pre-refactor code; these tests fail if a Verilog file's
 * output drifts by even one character.
 */
const root = path.join(__dirname, "..", "..", "..");
const fixtureDir = path.join(root, "test", "fixtures");
const goldenDir = path.join(root, "test", "golden");

const fixtures = fs
	.readdirSync(fixtureDir)
	.filter((f) => /\.(v|vh)$/.test(f))
	.sort();

for (const f of fixtures) {
	const base = f.replace(/\.(v|vh)$/, "");

	test(`golden: ${f} formats byte-for-byte (verilog)`, () => {
		const src = fs.readFileSync(path.join(fixtureDir, f), "utf8");
		const expected = fs.readFileSync(path.join(goldenDir, `${base}.fmt.txt`), "utf8");
		assert.equal(formatText(src), expected);
	});

	test(`golden: ${f} lints byte-for-byte (verilog)`, () => {
		const src = fs.readFileSync(path.join(fixtureDir, f), "utf8");
		const expected = JSON.parse(fs.readFileSync(path.join(goldenDir, `${base}.lint.json`), "utf8"));
		assert.deepEqual(lint(src).issues, expected);
	});
}
