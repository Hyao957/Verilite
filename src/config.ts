import * as vscode from "vscode";
import { DEFAULT_FORMAT_OPTIONS } from "./engine/format";
import type { FormatOptions } from "./engine/format";
import { DEFAULT_LINT_OPTIONS } from "./engine/lint";
import type { LintOptions } from "./engine/lint";

export const LANGUAGE_ID = "verilog";
export const CONFIG_SECTION = "verilite";

export type LintRunOn = "type" | "save" | "manual";

export interface VeriLiteConfig {
	lintEnabled: boolean;
	lintRunOn: LintRunOn;
	lintDebounceMs: number;
	lint: LintOptions;
	format: FormatOptions;
	completionEnabled: boolean;
	completionIncludeSystemTasks: boolean;
}

/** Read all verilite.* settings, resolved for the given document. */
export function readConfig(resource?: vscode.Uri): VeriLiteConfig {
	const c = vscode.workspace.getConfiguration(CONFIG_SECTION, resource ?? null);
	const editor = vscode.workspace.getConfiguration("editor", resource ?? null);
	const editorTabSize = editor.get<number>("tabSize", 4);

	return {
		lintEnabled: c.get<boolean>("lint.enable", true),
		lintRunOn: c.get<LintRunOn>("lint.runOn", "type"),
		lintDebounceMs: c.get<number>("lint.debounceMs", 400),
		lint: {
			...DEFAULT_LINT_OPTIONS,
			warnMissingDefault: c.get<boolean>("lint.warnMissingDefault", true),
			warnBlockingInSeq: c.get<boolean>("lint.warnBlockingInSeq", true),
			warnAlwaysNoSensitivity: c.get<boolean>("lint.warnAlwaysNoSensitivity", true),
			hintTrailingWhitespace: c.get<boolean>("lint.hintTrailingWhitespace", false),
			maxIssues: c.get<number>("lint.maxIssues", 100),
		},
		format: {
			...DEFAULT_FORMAT_OPTIONS,
			indentStyle: c.get<"space" | "tab">("format.indentStyle", "space"),
			indentSize: c.get<number>("format.indentSize", editorTabSize || 4),
			alignPorts: c.get<boolean>("format.alignPorts", true),
			alignAssignments: c.get<boolean>("format.alignAssignments", false),
			spaceAroundOperators: c.get<boolean>("format.spaceAroundOperators", true),
			joinBegin: c.get<boolean>("format.joinBegin", true),
			alignIfElse: c.get<boolean>("format.alignIfElse", true),
		},
		completionEnabled: c.get<boolean>("completion.enable", true),
		completionIncludeSystemTasks: c.get<boolean>("completion.includeSystemTasks", true),
	};
}
