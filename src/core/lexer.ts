import { KEYWORD_SET } from "./keywords";
import type {
	ColRange,
	LexResult,
	LineKind,
	Position,
	Token,
	TokenKind,
} from "./types";

/**
 * Token pattern. Order matters: longer operators must come before shorter ones.
 * Runs against the *masked* text, so it never sees comment or string content.
 */
const TOKEN_RE =
	/`[A-Za-z_][A-Za-z0-9_$]*|\$[A-Za-z_][A-Za-z0-9_$]*|[0-9][0-9_]*'[sS]?[bBoOdDhH][0-9a-fA-FxXzZ?_]+|'[sS]?[bBoOdDhH][0-9a-fA-FxXzZ?_]+|[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9]+)?|[A-Za-z_][A-Za-z0-9_$]*|===|!==|<<<|>>>|==|!=|&&|\|\||<=|>=|<<|>>|=>|\*>|->|\+:|-:|[-+*/%!~&|^<>=?:]|[()[\]{};,.@#]/g;

type MaskState = "normal" | "line" | "block" | "string" | "escaped";

function classify(text: string): TokenKind {
	const first = text[0];
	if (first === "`") return "directive";
	if (first === "$") return "systemTask";
	if (/^[0-9']/.test(text)) return "number";
	if (/^[A-Za-z_]/.test(text)) {
		return KEYWORD_SET.has(text.toLowerCase()) ? "keyword" : "identifier";
	}
	if (/^[()[\]{};,.@#]$/.test(text)) return "punctuation";
	return "operator";
}

/**
 * Single-pass masking lexer.
 *
 * Produces a "masked mirror" of the source that has exactly the same length and
 * line structure, but with every comment and string literal replaced by spaces.
 * Every later stage (linting, indenting, spacing, alignment) works on the mask,
 * which is what keeps `// end` inside a comment from breaking the block matcher.
 */
export function lex(text: string): LexResult {
	const masked: string[] = new Array(text.length);
	const protectedRanges: ColRange[][] = [[]];
	const lineStartsInBlockComment: boolean[] = [false];

	let state: MaskState = "normal";
	let line = 0;
	let col = 0;
	let regionStart = -1;
	let stringStart: Position | null = null;
	let blockStart: Position | null = null;
	let unterminatedString: Position | null = null;
	let unterminatedBlockComment: Position | null = null;

	const openRegion = () => {
		if (regionStart < 0) regionStart = col;
	};
	const closeRegion = (endCol: number) => {
		if (regionStart >= 0 && endCol > regionStart) {
			protectedRanges[line].push([regionStart, endCol]);
		}
		regionStart = -1;
	};

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		const next = i + 1 < text.length ? text[i + 1] : "";

		if (ch === "\n") {
			masked[i] = "\n";
			closeRegion(col);
			if (state === "line" || state === "escaped") state = "normal";
			if (state === "string") {
				if (!unterminatedString) unterminatedString = stringStart;
				state = "normal";
			}
			line++;
			col = 0;
			protectedRanges.push([]);
			lineStartsInBlockComment.push(state === "block");
			if (state === "block") regionStart = 0;
			continue;
		}

		switch (state) {
			case "normal": {
				if (ch === "/" && next === "/") {
					state = "line";
					openRegion();
					masked[i] = " ";
				} else if (ch === "/" && next === "*") {
					state = "block";
					blockStart = { line, col };
					openRegion();
					masked[i] = " ";
				} else if (ch === '"') {
					state = "string";
					stringStart = { line, col };
					openRegion();
					masked[i] = " ";
				} else if (ch === "\\") {
					// escaped identifier: \my$weird[sig] <space>
					state = "escaped";
					masked[i] = "_";
				} else {
					masked[i] = ch;
				}
				break;
			}
			case "escaped": {
				if (ch === " " || ch === "\t") {
					state = "normal";
					masked[i] = ch;
				} else {
					// keep it a single identifier token in the mask
					masked[i] = /[A-Za-z0-9_$]/.test(ch) ? ch : "_";
				}
				break;
			}
			case "line": {
				masked[i] = " ";
				break;
			}
			case "block": {
				masked[i] = " ";
				if (ch === "*" && next === "/") {
					masked[i + 1] = " ";
					i++;
					col++;
					state = "normal";
					closeRegion(col + 1);
				}
				break;
			}
			case "string": {
				masked[i] = " ";
				if (ch === "\\" && next !== "" && next !== "\n") {
					masked[i + 1] = " ";
					i++;
					col++;
				} else if (ch === '"') {
					state = "normal";
					closeRegion(col + 1);
				}
				break;
			}
		}
		col++;
	}

	closeRegion(col);
	if (state === "block") unterminatedBlockComment = blockStart;
	if (state === "string" && !unterminatedString) unterminatedString = stringStart;

	const maskedText = masked.join("");
	const maskedLines = maskedText.split("\n");
	const rawLines = text.split("\n");

	const tokens: Token[] = [];
	const tokensByLine: Token[][] = [];
	const lineKinds: LineKind[] = [];
	const parenDepthAtLineStart: number[] = [];
	let depth = 0;

	for (let l = 0; l < maskedLines.length; l++) {
		parenDepthAtLineStart.push(depth);
		const maskedLine = maskedLines[l];
		const rawLine = rawLines[l] ?? "";
		const lineTokens: Token[] = [];

		TOKEN_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = TOKEN_RE.exec(maskedLine)) !== null) {
			const tokenText = m[0];
			if (tokenText === "(") depth++;
			else if (tokenText === ")") depth = Math.max(0, depth - 1);
			const token: Token = {
				text: tokenText,
				lower: tokenText.toLowerCase(),
				line: l,
				col: m.index,
				endCol: m.index + tokenText.length,
				kind: classify(tokenText),
			};
			lineTokens.push(token);
			tokens.push(token);
		}
		tokensByLine.push(lineTokens);

		const maskedTrimmed = maskedLine.trim();
		if (rawLine.trim() === "") lineKinds.push("blank");
		else if (maskedTrimmed === "") lineKinds.push("comment");
		else if (maskedTrimmed.startsWith("`")) lineKinds.push("directive");
		else lineKinds.push("code");
	}

	while (lineStartsInBlockComment.length < maskedLines.length) {
		lineStartsInBlockComment.push(false);
	}
	while (protectedRanges.length < maskedLines.length) {
		protectedRanges.push([]);
	}

	return {
		masked: maskedText,
		maskedLines,
		rawLines,
		tokens,
		tokensByLine,
		lineKinds,
		lineStartsInBlockComment,
		parenDepthAtLineStart,
		protectedRanges,
		unterminatedString,
		unterminatedBlockComment,
	};
}
