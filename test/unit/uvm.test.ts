import assert from "node:assert/strict";
import { test } from "node:test";
import { UVM_ENTRIES, uvmEntriesOfKind, uvmEntryFor } from "../../src/core/uvm";

test("UVM entry names are unique", () => {
	const names = UVM_ENTRIES.map((e) => e.name);
	assert.equal(new Set(names).size, names.length);
});

test("every UVM entry is fully documented", () => {
	for (const e of UVM_ENTRIES) {
		assert.ok(e.name.length > 0, "missing name");
		assert.ok(e.group.length > 0, e.name + " has no group");
		assert.ok(e.doc.length > 0, e.name + " has no doc");
		assert.ok(["class", "method", "macro"].includes(e.kind), e.name + " has a bad kind");
	}
});

test("macro names carry no leading backtick", () => {
	for (const e of uvmEntriesOfKind("macro")) {
		assert.ok(!e.name.startsWith("`"), e.name);
	}
});

test("uvmEntryFor is case-insensitive", () => {
	assert.equal(uvmEntryFor("UVM_Driver")?.name, "uvm_driver");
	assert.equal(uvmEntryFor("uvm_component")?.kind, "class");
	assert.equal(uvmEntryFor("no_such_uvm_name"), undefined);
});

test("the UVM knowledge base covers the requested building blocks", () => {
	const names = new Set(UVM_ENTRIES.map((e) => e.name));
	for (const n of [
		"uvm_object", "uvm_component", "uvm_sequence", "uvm_sequencer",
		"uvm_driver", "uvm_monitor", "uvm_agent", "uvm_env", "uvm_test",
		"uvm_scoreboard", "uvm_factory", "uvm_config_db",
		"uvm_analysis_port", "uvm_tlm_analysis_fifo",
		"build_phase", "connect_phase", "run_phase",
		"uvm_component_utils", "uvm_object_utils", "uvm_info", "uvm_error",
	]) {
		assert.ok(names.has(n), "missing " + n);
	}
});