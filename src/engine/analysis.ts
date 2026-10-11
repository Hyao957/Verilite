/** Version-keyed cache of the lex + symbol-scan results shared by all features. */

import { lex } from "../core/lexer";
import type { Dialect, LexResult } from "../core/types";
import { buildScopeIndex } from "./scopes";
import type { ScopeIndex } from "./scopes";
import { scanSymbols } from "./symbols";
import type { VerilogSymbol } from "./symbols";

export interface DocumentAnalysis {
	/** document version the analysis was produced from */
	version: number;
	lexed: LexResult;
	symbols: VerilogSymbol[];
	/** container / enum member index, for scoped completion (`pkg::`, `obj.`) */
	scopes: ScopeIndex;
}

/**
 * Lexing and scanning the whole file is the expensive part shared by
 * completion, navigation and diagnostics. Keying an entry by document version
 * makes a cache hit O(1) and guarantees stale text is never served, so the
 * document is analysed at most once per edit.
 */
export class AnalysisCache {
	private readonly entries = new Map<string, DocumentAnalysis>();

	constructor(private readonly dialect: Dialect = "verilog") {}

	/** Analysis of `text`, reusing the cached entry when `version` is unchanged. */
	get(key: string, version: number, text: string): DocumentAnalysis {
		const cached = this.entries.get(key);
		if (cached && cached.version === version) return cached;

		const lexed = lex(text, this.dialect);
		const entry: DocumentAnalysis = {
			version,
			lexed,
			symbols: scanSymbols(lexed, this.dialect),
			scopes: buildScopeIndex(lexed, this.dialect),
		};
		this.entries.set(key, entry);
		return entry;
	}

	/** Drop the entry for a document (e.g. when it is closed). */
	forget(key: string): void {
		this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}
}