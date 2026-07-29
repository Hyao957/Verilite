import * as vscode from "vscode";
import { KEYWORD_DOCS } from "../core/keywords";
import { lex } from "../core/lexer";
import { LANGUAGE_ID } from "../config";
import { outlineFile, scanSymbols } from "../engine/symbols";
import type { SymbolKind, VerilogSymbol } from "../engine/symbols";

const SYMBOL_KIND_MAP: Record<SymbolKind, vscode.SymbolKind> = {
	module: vscode.SymbolKind.Module,
	port: vscode.SymbolKind.Variable,
	signal: vscode.SymbolKind.Field,
	parameter: vscode.SymbolKind.Constant,
	instance: vscode.SymbolKind.Class,
};

const SYMBOL_KIND_LABEL: Record<SymbolKind, string> = {
	module: "模块",
	port: "端口",
	signal: "信号",
	parameter: "参数",
	instance: "实例",
};

function nameRange(document: vscode.TextDocument, s: { line: number; col: number; name: string }): vscode.Range {
	const line = Math.min(s.line, document.lineCount - 1);
	const len = document.lineAt(line).text.length;
	const col = Math.min(s.col, len);
	return new vscode.Range(line, col, line, Math.min(col + s.name.length, len));
}

function memberSymbol(document: vscode.TextDocument, s: VerilogSymbol): vscode.DocumentSymbol {
	const range = nameRange(document, s);
	return new vscode.DocumentSymbol(s.name, s.detail, SYMBOL_KIND_MAP[s.kind], range, range);
}

/**
 * Document outline. Modules are top-level nodes with their ports, parameters
 * and internal signals nested underneath, which drives the Outline view, the
 * breadcrumb trail and the `@` / `@:` go-to-symbol pickers.
 */
export class VerilogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
		const outline = outlineFile(lex(document.getText()));
		const result: vscode.DocumentSymbol[] = [];

		for (const m of outline.modules) {
			const endLine = Math.min(m.endLine, document.lineCount - 1);
			const fullRange = new vscode.Range(m.line, 0, endLine, document.lineAt(endLine).text.length);
			const sym = new vscode.DocumentSymbol(
				m.name,
				"module",
				vscode.SymbolKind.Module,
				fullRange,
				nameRange(document, m),
			);
			sym.children = m.members.map((s) => memberSymbol(document, s));
			result.push(sym);
		}

		for (const s of outline.loose) result.push(memberSymbol(document, s));
		return result;
	}
}

/** Same-file go-to-definition for ports, signals, parameters and modules. */
export class VerilogDefinitionProvider implements vscode.DefinitionProvider {
	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.Location | undefined {
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) return undefined;
		const word = document.getText(wordRange);

		const match = scanSymbols(lex(document.getText())).find((s) => s.name === word);
		if (!match) return undefined;
		return new vscode.Location(document.uri, new vscode.Position(match.line, match.col));
	}
}

/** Hover: declaration summary for local symbols, one-liner for keywords. */
export class VerilogHoverProvider implements vscode.HoverProvider {
	provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) return undefined;
		const word = document.getText(wordRange);

		const match = scanSymbols(lex(document.getText())).find((s) => s.name === word);
		if (match) {
			const md = new vscode.MarkdownString();
			md.appendCodeblock(`${match.detail} ${match.name}`.trim(), "verilog");
			md.appendMarkdown(`\n\n${SYMBOL_KIND_LABEL[match.kind]} · 定义于第 ${match.line + 1} 行`);
			return new vscode.Hover(md, wordRange);
		}

		const doc = KEYWORD_DOCS[word.toLowerCase()];
		if (doc) {
			return new vscode.Hover(new vscode.MarkdownString(`**${word}** — ${doc}`), wordRange);
		}
		return undefined;
	}
}

export function registerNavigation(): vscode.Disposable[] {
	const selector: vscode.DocumentSelector = { language: LANGUAGE_ID, scheme: "*" };
	return [
		vscode.languages.registerDocumentSymbolProvider(selector, new VerilogDocumentSymbolProvider()),
		vscode.languages.registerDefinitionProvider(selector, new VerilogDefinitionProvider()),
		vscode.languages.registerHoverProvider(selector, new VerilogHoverProvider()),
	];
}
