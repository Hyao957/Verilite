import * as vscode from "vscode";
import { DIALECTS } from "./core/types";
import type { Dialect } from "./core/types";
import { AnalysisService } from "./features/analysis";
import { registerCommands } from "./features/commands";
import { registerCompletion } from "./features/completion";
import { DiagnosticsController } from "./features/diagnostics";
import { registerFolding } from "./features/folding";
import { registerFormatter } from "./features/formatter";
import { registerNavigation } from "./features/navigation";

/** One diagnostics controller per dialect, keyed by language id. */
const controllers = new Map<Dialect, DiagnosticsController>();

export function activate(context: vscode.ExtensionContext): void {
	// Each provider implementation is written once and registered for both
	// language ids ("verilog" and "systemverilog"), parameterised by dialect.
	for (const dialect of DIALECTS) {
		// A single analysis cache per dialect is shared by completion, navigation
		// and diagnostics, so a document is lexed and scanned once per edit.
		const analysis = new AnalysisService(dialect);
		const controller = new DiagnosticsController(dialect, analysis);
		controllers.set(dialect, controller);
		context.subscriptions.push(
			analysis,
			controller,
			registerCompletion(dialect, analysis),
			...registerFormatter(dialect),
			...registerNavigation(dialect, analysis),
			registerFolding(dialect, analysis),
		);
	}

	context.subscriptions.push(...registerCommands(controllers));
	console.log("[VeriLite] activated");
}

export function deactivate(): void {
	for (const controller of controllers.values()) controller.dispose();
	controllers.clear();
}
