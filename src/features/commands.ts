import * as vscode from "vscode";
import { DIALECTS } from "../core/types";
import type { Dialect } from "../core/types";
import { readConfig } from "../config";
import { computeStartLevel, formatText } from "../engine/format";
import type { DiagnosticsController } from "./diagnostics";

const HDL_LANGUAGES = new Set<string>(DIALECTS);

function activeHdlEditor(): vscode.TextEditor | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !HDL_LANGUAGES.has(editor.document.languageId)) {
		vscode.window.showWarningMessage("VeriLite: \u8bf7\u5148\u6253\u5f00\u4e00\u4e2a Verilog / SystemVerilog \u6587\u4ef6\u3002");
		return undefined;
	}
	return editor;
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function buildHeader(fileName: string): string {
	const now = new Date();
	const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
	const moduleName = fileName.replace(/\.[^.]+$/, "");
	const bar = "//" + "=".repeat(77);
	const thin = "//" + "-".repeat(77);
	return [
		bar,
		`// Module      : ${moduleName}`,
		"// Author      : ",
		`// Date        : ${date}`,
		"// Description : ",
		thin,
		"// Revision History:",
		`//   ${date}    Initial version`,
		bar,
		"",
		"",
	].join("\n");
}

export function registerCommands(
	controllers: Map<Dialect, DiagnosticsController>,
): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand("verilite.lintNow", () => {
			const editor = activeHdlEditor();
			if (!editor) return;
			controllers.get(editor.document.languageId as Dialect)?.runNow(editor.document);
		}),

		vscode.commands.registerCommand("verilite.clearDiagnostics", () => {
			for (const controller of controllers.values()) controller.clearAll();
		}),

		vscode.commands.registerCommand("verilite.insertHeader", async () => {
			const editor = activeHdlEditor();
			if (!editor) return;
			const fileName = editor.document.uri.path.split("/").pop() ?? "module";
			await editor.edit((builder) => {
				builder.insert(new vscode.Position(0, 0), buildHeader(fileName));
			});
		}),

		vscode.commands.registerCommand("verilite.alignSelection", async () => {
			const editor = activeHdlEditor();
			if (!editor) return;
			const dialect = editor.document.languageId as Dialect;
			const config = readConfig(editor.document);
			const selection = editor.selection;
			if (selection.isEmpty) {
				vscode.window.showInformationMessage("VeriLite: \u8bf7\u5148\u9009\u4e2d\u8981\u5bf9\u9f50\u7684\u884c\u3002");
				return;
			}

			const endLine = editor.document.lineAt(selection.end.line);
			const target = new vscode.Range(
				selection.start.line,
				0,
				endLine.lineNumber,
				endLine.text.length,
			);
			const before = editor.document.getText(
				new vscode.Range(0, 0, target.start.line, 0),
			);
			const formatted = formatText(
				editor.document.getText(target),
				{ ...config.format, alignPorts: true, alignAssignments: true },
				computeStartLevel(before, dialect),
				dialect,
			);
			await editor.edit((builder) => builder.replace(target, formatted));
		}),
	];
}
