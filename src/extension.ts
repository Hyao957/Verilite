import * as vscode from "vscode";
import { registerCommands } from "./features/commands";
import { registerCompletion } from "./features/completion";
import { DiagnosticsController } from "./features/diagnostics";
import { registerFormatter } from "./features/formatter";

let diagnostics: DiagnosticsController | undefined;

export function activate(context: vscode.ExtensionContext): void {
	diagnostics = new DiagnosticsController();

	context.subscriptions.push(
		diagnostics,
		registerCompletion(),
		...registerFormatter(),
		...registerCommands(diagnostics),
	);

	console.log("[VeriLite] activated");
}

export function deactivate(): void {
	diagnostics?.dispose();
	diagnostics = undefined;
}
