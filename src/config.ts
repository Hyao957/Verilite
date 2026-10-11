import * as vscode from "vscode";
import { DEFAULT_FORMAT_OPTIONS } from "./engine/format";
import type { FormatOptions } from "./engine/format";
import { DEFAULT_LINT_OPTIONS } from "./engine/lint";
import type { LintOptions } from "./engine/lint";

export const LANGUAGE_ID = "verilog";
export const SYSTEMVERILOG_LANGUAGE_ID = "systemverilog";
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

/**
 * Read all verilite.* settings, resolved for the given document. Passing the
 * document (not just its URI) lets VS Code apply `"scope": "language-overridable"`
 * settings, so users can override any verilite.* option per language.
 */
export function readConfig(document: vscode.TextDocument): VeriLiteConfig {
	const c = vscode.workspace.getConfiguration(CONFIG_SECTION, document);
	const editor = vscode.workspace.getConfiguration("editor", document);
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
			alignDeclarations: c.get<boolean>("format.alignDeclarations", true),
			alignParams: c.get<boolean>("format.alignParams", true),
			alignDeclAssignments: c.get<boolean>("format.alignDeclAssignments", true),
			alignInstancePorts: c.get<boolean>("format.alignInstancePorts", true),
				alignBlockAssignments: c.get<boolean>("format.alignBlockAssignments", true),
		},
		completionEnabled: c.get<boolean>("completion.enable", true),
		completionIncludeSystemTasks: c.get<boolean>("completion.includeSystemTasks", true),
	};
}
