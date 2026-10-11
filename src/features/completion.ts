import * as vscode from "vscode";
import { keywordsFor, systemTasksFor } from "../core/keywords";
import { uvmEntriesOfKind } from "../core/uvm";
import type { UvmEntry, UvmKind } from "../core/uvm";
import type { Dialect, LexResult } from "../core/types";
import { readConfig } from "../config";
import type { DocumentAnalysis } from "../engine/analysis";
import type { SymbolKind, VerilogSymbol } from "../engine/symbols";
import type { AnalysisService } from "./analysis";

const SNIPPET_PREFIX_WORDS = new Set([
	"begin",
	"module",
	"always",
	"if",
	"initial",
	"case",
	"for",
	"function",
	"task",
	"wire",
	"reg",
	"parameter",
	"localparam",
	"always_ff",
	"always_comb",
	"always_latch",
	"interface",
	"package",
	"class",
	"foreach",
	"constraint",
	"property",
	"covergroup",
	"clocking",
	"mailbox",
	"semaphore",
	"rand",
	"virtual",
	"modport",
	"extends",
]);

const SYMBOL_KIND_MAP: Record<SymbolKind, vscode.CompletionItemKind> = {
	module: vscode.CompletionItemKind.Module,
	port: vscode.CompletionItemKind.Variable,
	signal: vscode.CompletionItemKind.Field,
	parameter: vscode.CompletionItemKind.Constant,
	instance: vscode.CompletionItemKind.Class,
        type: vscode.CompletionItemKind.Struct,
	method: vscode.CompletionItemKind.Method,
	interface: vscode.CompletionItemKind.Interface,
	modport: vscode.CompletionItemKind.Field,
	package: vscode.CompletionItemKind.Module,
	program: vscode.CompletionItemKind.Module,
	enumMember: vscode.CompletionItemKind.EnumMember,
};

/**
 * Keyword and single-file symbol completion.
 *
 * The document is analysed (lexed + scanned) through the shared
 * {@link AnalysisService}, so typing never re-scans the file more than once per
 * version across all providers.
 */
export class VerilogCompletionProvider implements vscode.CompletionItemProvider {
	private readonly staticItems: vscode.CompletionItem[];
	private readonly systemTaskItems: vscode.CompletionItem[];
	private readonly directiveItems: vscode.CompletionItem[];
	private readonly uvmItems: vscode.CompletionItem[];
	private readonly uvmMacroItems: vscode.CompletionItem[];
	private readonly uvmBaseClassItems: vscode.CompletionItem[];

	constructor(
		dialect: Dialect,
		private readonly analysis: AnalysisService,
	) {
		const kw = keywordsFor(dialect);
		this.staticItems = [
			...kw.control.map((word) =>
				makeItem(word, vscode.CompletionItemKind.Keyword, "\u5173\u952e\u5b57", kw.docs[word]),
			),
			...kw.dataTypes.map((word) =>
				makeItem(word, vscode.CompletionItemKind.TypeParameter, "\u6570\u636e\u7c7b\u578b", kw.docs[word]),
			),
		];
		this.systemTaskItems = systemTasksFor(dialect).map((word) =>
			makeItem(word, vscode.CompletionItemKind.Function, "\u7cfb\u7edf\u4efb\u52a1"),
		);
		this.directiveItems = kw.directives.map((word) => {
			const item = makeItem(word, vscode.CompletionItemKind.Reference, "\u7f16\u8bd1\u6307\u4ee4");
			item.insertText = word;
			return item;
		});

		this.uvmItems =
			dialect === "systemverilog"
				? [...uvmEntriesOfKind("class"), ...uvmEntriesOfKind("method")].map(uvmItem)
				: [];
		this.uvmMacroItems =
			dialect === "systemverilog"
				? uvmEntriesOfKind("macro").map((entry) => {
						const item = uvmItem(entry);
						item.insertText = entry.name;
						return item;
					})
				: [];
		this.uvmBaseClassItems =
			dialect === "systemverilog" ? uvmEntriesOfKind("class").map(uvmItem) : [];
	}

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] {
		const config = readConfig(document);
		if (!config.completionEnabled) return [];

		const entry = this.analysis.analyze(document);

		// never pop up inside a comment or a string literal
		if (isInsideProtectedRegion(entry.lexed, position.line, position.character)) return [];

		const linePrefix = document.lineAt(position.line).text.slice(0, position.character);

		// after a backtick, only compiler directives and UVM macros make sense
		if (/`[A-Za-z_]*$/.test(linePrefix)) return [...this.directiveItems, ...this.uvmMacroItems];
		// after a dollar sign, only system tasks
		if (/\$[A-Za-z_]*$/.test(linePrefix)) {
			return config.completionIncludeSystemTasks ? this.systemTaskItems : [];
		}
		// inside a port connection `.name(` we only want local signals
		if (/\.\s*[A-Za-z_]\w*\s*\($/.test(linePrefix)) {
			return entry.symbols.map(symbolToItem);
		}

		// `pkg::member` / `EnumType::MEMBER` - only that scope's members
		const scoped = /([A-Za-z_]\w*)\s*::\s*([A-Za-z_]\w*)?$/.exec(linePrefix);
		if (scoped) {
			return (memberLookup(entry, scoped[1]) ?? entry.symbols).map(symbolToItem);
		}

		// `obj.member` - narrow to the members of the receiver's declared type
		const member = /([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)?$/.exec(linePrefix);
		if (member) {
			const decl = entry.symbols.find((s) => s.name === member[1]);
			const typeName = declaredTypeName(decl);
			const members = typeName ? memberLookup(entry, typeName) : undefined;
			return (members ?? entry.symbols).map(symbolToItem);
		}

		// `class foo extends uvm_...` - only UVM base classes fit here
		if (/extends\s+uvm_[A-Za-z_]*$/.test(linePrefix)) return this.uvmBaseClassItems;

		const items: vscode.CompletionItem[] = [...this.staticItems];
		if (config.completionIncludeSystemTasks) items.push(...this.systemTaskItems);
		items.push(...this.uvmItems);
		items.push(...entry.symbols.map(symbolToItem));
		return items;
	}
}

function makeItem(
	label: string,
	kind: vscode.CompletionItemKind,
	detail: string,
	documentation?: string,
): vscode.CompletionItem {
	const item = new vscode.CompletionItem(label, kind);
	item.detail = detail;
	if (documentation) item.documentation = new vscode.MarkdownString(documentation);
	// Keywords that clash with a snippet prefix are sorted after the template
	if (SNIPPET_PREFIX_WORDS.has(label)) item.sortText = `~${label}`;
	return item;
}

const UVM_KIND_MAP: Record<UvmKind, vscode.CompletionItemKind> = {
	class: vscode.CompletionItemKind.Class,
	method: vscode.CompletionItemKind.Method,
	macro: vscode.CompletionItemKind.Function,
};

function uvmItem(entry: UvmEntry): vscode.CompletionItem {
	return makeItem(entry.name, UVM_KIND_MAP[entry.kind], entry.group, entry.doc);
}

function symbolToItem(symbol: VerilogSymbol): vscode.CompletionItem {
	const item = new vscode.CompletionItem(symbol.name, SYMBOL_KIND_MAP[symbol.kind]);
	item.detail = symbol.detail;
	item.documentation = new vscode.MarkdownString(
		`\u5b9a\u4e49\u4e8e\u7b2c ${symbol.line + 1} \u884c`,
	);
	// local symbols should sort above generic keywords
	item.sortText = `0_${symbol.name}`;
	return item;
}

/** Members of a package / class / interface / enum name, when it is a known scope. */
function memberLookup(entry: DocumentAnalysis, name: string): VerilogSymbol[] | undefined {
	return entry.scopes.enums.get(name) ?? entry.scopes.containers.get(name);
}

/** The (possibly package-qualified) base type a symbol was declared with. */
function declaredTypeName(symbol: VerilogSymbol | undefined): string | undefined {
	if (!symbol) return undefined;
	const base = symbol.detail.replace(/\s*#\(.*$/, "").trim().split(/\s+/)[0];
	return base.split("::").pop() || undefined;
}

function isInsideProtectedRegion(lexed: LexResult, line: number, col: number): boolean {
	if (lexed.lineStartsInBlockComment[line]) return true;
	const ranges = lexed.protectedRanges[line] ?? [];
	return ranges.some(([start, end]) => col > start && col <= end);
}

export function registerCompletion(dialect: Dialect, analysis: AnalysisService): vscode.Disposable {
	const provider = new VerilogCompletionProvider(dialect, analysis);
	return vscode.languages.registerCompletionItemProvider(
		{ language: dialect, scheme: "*" },
		provider,
		"`",
		"$",
		".",
	);
}
