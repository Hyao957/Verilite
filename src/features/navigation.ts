import * as vscode from "vscode";
import { keywordsFor } from "../core/keywords";
import { uvmEntryFor } from "../core/uvm";
import type { Dialect } from "../core/types";
import { outlineFile } from "../engine/symbols";
import type { OutlineNode, SymbolKind } from "../engine/symbols";
import type { AnalysisService } from "./analysis";

const SYMBOL_KIND_MAP: Record<SymbolKind, vscode.SymbolKind> = {
	module: vscode.SymbolKind.Module,
	port: vscode.SymbolKind.Variable,
	signal: vscode.SymbolKind.Field,
	parameter: vscode.SymbolKind.Constant,
	instance: vscode.SymbolKind.Class,
        type: vscode.SymbolKind.Struct,
	method: vscode.SymbolKind.Method,
	interface: vscode.SymbolKind.Interface,
	modport: vscode.SymbolKind.Field,
	package: vscode.SymbolKind.Package,
	program: vscode.SymbolKind.Module,
	enumMember: vscode.SymbolKind.EnumMember,
};

const SYMBOL_KIND_LABEL: Record<SymbolKind, string> = {
	module: "\u6a21\u5757",
	port: "\u7aef\u53e3",
	signal: "\u4fe1\u53f7",
	parameter: "\u53c2\u6570",
	instance: "\u5b9e\u4f8b",
        type: "\u7c7b\u578b",
	method: "\u65b9\u6cd5",
	interface: "\u63a5\u53e3",
	modport: "modport",
	package: "\u5305",
	program: "\u7a0b\u5e8f",
	enumMember: "\u679a\u4e3e\u6210\u5458",
};

function nameRange(document: vscode.TextDocument, s: { line: number; col: number; name: string }): vscode.Range {
	const line = Math.min(s.line, document.lineCount - 1);
	const len = document.lineAt(line).text.length;
	const col = Math.min(s.col, len);
	return new vscode.Range(line, col, line, Math.min(col + s.name.length, len));
}

/**
 * Build a `DocumentSymbol` for one outline node and, recursively, for its
 * children. Containers span their whole body while leaves span only their name,
 * so the Outline view and the breadcrumb trail can expand `class` /
 * `interface` / `package` exactly like a `module`.
 */
function toDocumentSymbol(document: vscode.TextDocument, node: OutlineNode): vscode.DocumentSymbol {
	const selectionRange = nameRange(document, node);
	const startLine = Math.min(node.line, document.lineCount - 1);
	const endLine = Math.min(Math.max(node.endLine, startLine), document.lineCount - 1);
	const isContainer = node.endLine > node.line || node.children.length > 0;
	const range = isContainer
		? new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
		: selectionRange;
	const sym = new vscode.DocumentSymbol(
		node.name,
		node.detail,
		SYMBOL_KIND_MAP[node.kind],
		range,
		selectionRange,
	);
	sym.children = node.children.map((child) => toDocumentSymbol(document, child));
	return sym;
}

/**
 * Document outline. Modules, classes, interfaces and packages are containers
 * with their ports, signals, methods and modports nested underneath, which
 * drives the Outline view, the breadcrumb trail and the `@` / `@:`
 * go-to-symbol pickers.
 */
export class VerilogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	constructor(
		private readonly dialect: Dialect,
		private readonly analysis: AnalysisService,
	) {}

	provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
		const outline = outlineFile(this.analysis.analyze(document).lexed, this.dialect);
		return outline.roots.map((node) => toDocumentSymbol(document, node));
	}
}
/** Same-file go-to-definition for ports, signals, parameters and modules. */
export class VerilogDefinitionProvider implements vscode.DefinitionProvider {
	constructor(private readonly analysis: AnalysisService) {}

	provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.Location | undefined {
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) return undefined;
		const word = document.getText(wordRange);

                const match = this.analysis.analyze(document).symbols.find((s) => s.name === word);
		if (!match) return undefined;
		return new vscode.Location(document.uri, new vscode.Position(match.line, match.col));
	}
}

/** Hover: declaration summary for local symbols, one-liner for keywords. */
export class VerilogHoverProvider implements vscode.HoverProvider {
	constructor(
		private readonly dialect: Dialect,
		private readonly analysis: AnalysisService,
	) {}

	provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) return undefined;
		const word = document.getText(wordRange);

                const match = this.analysis.analyze(document).symbols.find((s) => s.name === word);
		if (match) {
			const md = new vscode.MarkdownString();
			md.appendCodeblock(`${match.detail} ${match.name}`.trim(), "verilog");
			md.appendMarkdown(`\n\n${SYMBOL_KIND_LABEL[match.kind]} \u00b7 \u5b9a\u4e49\u4e8e\u7b2c ${match.line + 1} \u884c`);
			return new vscode.Hover(md, wordRange);
		}

		const uvm = uvmEntryFor(word);
		if (uvm) {
			return new vscode.Hover(new vscode.MarkdownString(`**${word}** \u2014 ${uvm.doc}`), wordRange);
		}

		const doc = keywordsFor(this.dialect).docs[word.toLowerCase()];
		if (doc) {
			return new vscode.Hover(new vscode.MarkdownString(`**${word}** \u2014 ${doc}`), wordRange);
		}
		return undefined;
	}
}

export function registerNavigation(dialect: Dialect, analysis: AnalysisService): vscode.Disposable[] {
	const selector: vscode.DocumentSelector = { language: dialect, scheme: "*" };
	return [
		vscode.languages.registerDocumentSymbolProvider(
			selector,
			new VerilogDocumentSymbolProvider(dialect, analysis),
		),
		vscode.languages.registerDefinitionProvider(selector, new VerilogDefinitionProvider(analysis)),
		vscode.languages.registerHoverProvider(selector, new VerilogHoverProvider(dialect, analysis)),
	];
}
