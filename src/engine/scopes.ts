/**
 * Scope index for member completion.
 *
 * A flat symbol scan cannot answer `pkg::` or `obj.` - it does not know which
 * declarations live inside which container. This module reuses the outline tree
 * (containers paired with their end keywords) and the enum scanner to build a
 * name -> members map, so the completion provider can narrow a scoped access to
 * the members that actually exist.
 */

import type { Dialect, LexResult } from "../core/types";
import { enumMemberSymbols, outlineFile } from "./symbols";
import type { OutlineNode, SymbolKind, VerilogSymbol } from "./symbols";

/** A container's line span, used to find the scope enclosing a position. */
export interface ContainerSpan {
	name: string;
	kind: SymbolKind;
	detail: string;
	line: number;
	endLine: number;
}

export interface ScopeIndex {
	/** class / interface / package / module / program name -> its members */
	containers: Map<string, VerilogSymbol[]>;
	/** enum type name -> its members */
	enums: Map<string, VerilogSymbol[]>;
	/** every container span, for enclosing-scope queries */
	spans: ContainerSpan[];
}

function isContainerNode(node: OutlineNode): boolean {
	switch (node.kind) {
		case "module":
		case "interface":
		case "package":
		case "program":
			return true;
		case "type":
			// a class is a container; a struct / enum typedef is a leaf
			return node.detail.startsWith("class");
		default:
			return false;
	}
}

function walk(node: OutlineNode, containers: Map<string, VerilogSymbol[]>, spans: ContainerSpan[]): void {
	if (isContainerNode(node)) {
		containers.set(
			node.name,
			node.children.map((child) => ({
				name: child.name,
				kind: child.kind,
				detail: child.detail,
				line: child.line,
				col: child.col,
			})),
		);
		spans.push({
			name: node.name,
			kind: node.kind,
			detail: node.detail,
			line: node.line,
			endLine: node.endLine,
		});
	}
	for (const child of node.children) walk(child, containers, spans);
}

/** Build the member / enum index for one document. */
export function buildScopeIndex(lexed: LexResult, dialect: Dialect = "verilog"): ScopeIndex {
	const containers = new Map<string, VerilogSymbol[]>();
	const spans: ContainerSpan[] = [];
	for (const root of outlineFile(lexed, dialect).roots) walk(root, containers, spans);
	return { containers, enums: enumMemberSymbols(lexed, dialect), spans };
}