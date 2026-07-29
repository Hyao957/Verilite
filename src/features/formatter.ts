import * as vscode from "vscode";
import { LANGUAGE_ID, readConfig } from "../config";
import { computeStartLevel, formatText } from "../engine/format";

function fullRange(document: vscode.TextDocument): vscode.Range {
	const last = document.lineAt(document.lineCount - 1);
	return new vscode.Range(0, 0, last.lineNumber, last.text.length);
}

/** Expand a selection so it always covers whole lines. */
function wholeLines(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
	const end = document.lineAt(range.end.line);
	return new vscode.Range(range.start.line, 0, end.lineNumber, end.text.length);
}

export class VerilogFormatter
	implements
		vscode.DocumentFormattingEditProvider,
		vscode.DocumentRangeFormattingEditProvider
{
	provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
		const config = readConfig(document.uri);
		try {
			const formatted = formatText(document.getText(), config.format, 0);
			if (formatted === document.getText()) return [];
			return [vscode.TextEdit.replace(fullRange(document), formatted)];
		} catch (err) {
			console.error("[VeriLite] format failed", err);
			vscode.window.showErrorMessage("VeriLite: \u683c\u5f0f\u5316\u5931\u8d25\uff0c\u6587\u4ef6\u672a\u88ab\u4fee\u6539\u3002");
			return [];
		}
	}

	provideDocumentRangeFormattingEdits(
		document: vscode.TextDocument,
		range: vscode.Range,
	): vscode.TextEdit[] {
		const config = readConfig(document.uri);
		const target = wholeLines(document, range);

		try {
			// The selection must inherit the indent level of everything above it,
			// otherwise every selected line snaps back to column zero.
			const before = document.getText(new vscode.Range(0, 0, target.start.line, 0));
			const startLevel = computeStartLevel(before);
			const slice = document.getText(target);
			const formatted = formatText(slice, config.format, startLevel);
			if (formatted === slice) return [];
			return [vscode.TextEdit.replace(target, formatted)];
		} catch (err) {
			console.error("[VeriLite] range format failed", err);
			vscode.window.showErrorMessage("VeriLite: \u683c\u5f0f\u5316\u5931\u8d25\uff0c\u9009\u4e2d\u533a\u57df\u672a\u88ab\u4fee\u6539\u3002");
			return [];
		}
	}
}

export function registerFormatter(): vscode.Disposable[] {
	const formatter = new VerilogFormatter();
	const selector: vscode.DocumentSelector = { language: LANGUAGE_ID, scheme: "*" };
	return [
		vscode.languages.registerDocumentFormattingEditProvider(selector, formatter),
		vscode.languages.registerDocumentRangeFormattingEditProvider(selector, formatter),
	];
}
