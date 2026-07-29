import * as vscode from "vscode";
import { lex } from "../core/lexer";
import {
	CONTROL_KEYWORDS,
	DATA_TYPES,
	DIRECTIVES,
	KEYWORD_DOCS,
	SYSTEM_TASKS,
} from "../core/keywords";
import type { LexResult } from "../core/types";
import { LANGUAGE_ID, readConfig } from "../config";
import { scanSymbols } from "../engine/symbols";
import type { SymbolKind, VerilogSymbol } from "../engine/symbols";

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
]);

const SYMBOL_KIND_MAP: Record<SymbolKind, vscode.CompletionItemKind> = {
	module: vscode.CompletionItemKind.Module,
	port: vscode.CompletionItemKind.Variable,
	signal: vscode.CompletionItemKind.Field,
	parameter: vscode.CompletionItemKind.Constant,
	instance: vscode.CompletionItemKind.Class,
};

interface CacheEntry {
	version: number;
	lexed: LexResult;
	symbols: VerilogSymbol[];
}

/**
 * Keyword and single-file symbol completion.
 *
 * The document is lexed once per version and cached, so typing does not
 * re-scan the file on every keystroke.
 */
export class VerilogCompletionProvider
	implements vscode.CompletionItemProvider, vscode.Disposable
{
	private readonly cache = new Map<string, CacheEntry>();
	private readonly disposables: vscode.Disposable[] = [];
	private readonly staticItems: vscode.CompletionItem[];
	private readonly systemTaskItems: vscode.CompletionItem[];
	private readonly directiveItems: vscode.CompletionItem[];

	constructor() {
		this.staticItems = [
			...CONTROL_KEYWORDS.map((word) =>
				makeItem(word, vscode.CompletionItemKind.Keyword, "\u5173\u952e\u5b57", KEYWORD_DOCS[word]),
			),
			...DATA_TYPES.map((word) =>
				makeItem(word, vscode.CompletionItemKind.TypeParameter, "\u6570\u636e\u7c7b\u578b", KEYWORD_DOCS[word]),
			),
		];
		this.systemTaskItems = SYSTEM_TASKS.map((word) =>
			makeItem(word, vscode.CompletionItemKind.Function, "\u7cfb\u7edf\u4efb\u52a1"),
		);
		this.directiveItems = DIRECTIVES.map((word) => {
			const item = makeItem(word, vscode.CompletionItemKind.Reference, "\u7f16\u8bd1\u6307\u4ee4");
			item.insertText = word;
			return item;
		});

		this.disposables.push(
			vscode.workspace.onDidCloseTextDocument((doc) => this.cache.delete(doc.uri.toString())),
		);
	}

	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.CompletionItem[] {
		const config = readConfig(document.uri);
		if (!config.completionEnabled) return [];

		const entry = this.analyze(document);

		// never pop up inside a comment or a string literal
		if (isInsideProtectedRegion(entry.lexed, position.line, position.character)) return [];

		const linePrefix = document.lineAt(position.line).text.slice(0, position.character);

		// after a backtick, only compiler directives make sense
		if (/`[A-Za-z_]*$/.test(linePrefix)) return this.directiveItems;
		// after a dollar sign, only system tasks
		if (/\$[A-Za-z_]*$/.test(linePrefix)) {
			return config.completionIncludeSystemTasks ? this.systemTaskItems : [];
		}
		// inside a port connection `.name(` we only want local signals
		if (/\.\s*[A-Za-z_]\w*\s*\($/.test(linePrefix)) {
			return entry.symbols.map(symbolToItem);
		}

		const items: vscode.CompletionItem[] = [...this.staticItems];
		if (config.completionIncludeSystemTasks) items.push(...this.systemTaskItems);
		items.push(...entry.symbols.map(symbolToItem));
		return items;
	}

	private analyze(document: vscode.TextDocument): CacheEntry {
		const key = document.uri.toString();
		const cached = this.cache.get(key);
		if (cached && cached.version === document.version) return cached;

		const lexed = lex(document.getText());
		const entry: CacheEntry = {
			version: document.version,
			lexed,
			symbols: scanSymbols(lexed),
		};
		this.cache.set(key, entry);
		return entry;
	}

	dispose(): void {
		for (const d of this.disposables) d.dispose();
		this.disposables.length = 0;
		this.cache.clear();
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
	// 与 snippet 撞名的关键字排到模板之后
	if (SNIPPET_PREFIX_WORDS.has(label)) item.sortText = `~${label}`;
	return item;
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

function isInsideProtectedRegion(lexed: LexResult, line: number, col: number): boolean {
	if (lexed.lineStartsInBlockComment[line]) return true;
	const ranges = lexed.protectedRanges[line] ?? [];
	return ranges.some(([start, end]) => col > start && col <= end);
}

export function registerCompletion(): vscode.Disposable {
	const provider = new VerilogCompletionProvider();
	return vscode.Disposable.from(
		provider,
		vscode.languages.registerCompletionItemProvider(
			{ language: LANGUAGE_ID, scheme: "*" },
			provider,
			"`",
			"$",
			".",
		),
	);
}
