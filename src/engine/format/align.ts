/**
 * Pass 3 of the formatter: column alignment.
 *
 * Only consecutive runs of the same kind of line are aligned; any other line
 * breaks the run. That keeps the transformation local, predictable, and
 * idempotent.
 */

const PORT_RE =
	/^(input|output|inout)\s+(?:(wire|reg|logic|tri|wand|wor)\s+)?(?:(signed|unsigned)\s+)?(?:(\[[^\]]*\])\s*)?([A-Za-z_]\w*)\s*(,?)$/;

const ASSIGN_RE =
	/^(assign\s+[A-Za-z_][\w$]*(?:\s*\[[^\]]*\])?)\s*=\s*(.*)$/;

interface Split {
	code: string;
	comment: string;
}

/** Separate a trailing line comment using the protected ranges of that line. */
function splitComment(text: string, commentStart: number | null): Split {
	if (commentStart === null || commentStart >= text.length) {
		return { code: text.trimEnd(), comment: "" };
	}
	return {
		code: text.slice(0, commentStart).trimEnd(),
		comment: text.slice(commentStart).trimEnd(),
	};
}

interface PortParts {
	dir: string;
	type: string;
	sign: string;
	msb: string;
	lsb: string;
	single: string;
	name: string;
	comma: string;
	comment: string;
}

function parsePort(code: string, comment: string): PortParts | null {
	const m = PORT_RE.exec(code);
	if (!m) return null;
	const range = m[4] ?? "";
	let msb = "";
	let lsb = "";
	let single = "";
	if (range) {
		const inner = range.slice(1, -1);
		const idx = inner.indexOf(":");
		if (idx >= 0) {
			msb = inner.slice(0, idx).trim();
			lsb = inner.slice(idx + 1).trim();
		} else {
			single = inner.trim();
		}
	}
	return {
		dir: m[1],
		type: m[2] ?? "",
		sign: m[3] ?? "",
		msb,
		lsb,
		single,
		name: m[5],
		comma: m[6] ?? "",
		comment,
	};
}

function renderPortGroup(group: PortParts[]): string[] {
	const dirW = Math.max(...group.map((p) => p.dir.length));
	const typeW = Math.max(...group.map((p) => p.type.length));
	const signW = Math.max(...group.map((p) => p.sign.length));
	const msbW = Math.max(0, ...group.map((p) => p.msb.length));
	const lsbW = Math.max(0, ...group.map((p) => p.lsb.length));

	const renderRange = (p: PortParts): string => {
		if (p.msb || p.lsb) {
			return `[${p.msb.padStart(msbW)}:${p.lsb.padEnd(lsbW)}]`;
		}
		if (p.single) return `[${p.single}]`;
		return "";
	};

	const rangeStrings = group.map(renderRange);
	const rangeW = Math.max(0, ...rangeStrings.map((s) => s.length));

	const codes = group.map((p, i) => {
		let s = p.dir.padEnd(dirW);
		if (typeW > 0) s += " " + p.type.padEnd(typeW);
		if (signW > 0) s += " " + p.sign.padEnd(signW);
		if (rangeW > 0) s += " " + rangeStrings[i].padEnd(rangeW);
		s += " " + p.name + p.comma;
		return s.replace(/[ \t]+$/, "");
	});

	const hasComment = group.some((p) => p.comment.length > 0);
	if (!hasComment) return codes;

	const codeW = Math.max(...codes.map((c) => c.length));
	return codes.map((c, i) =>
		group[i].comment ? `${c.padEnd(codeW)}  ${group[i].comment}` : c,
	);
}

function renderAssignGroup(rows: Array<{ lhs: string; rhs: string; comment: string }>): string[] {
	const lhsW = Math.max(...rows.map((r) => r.lhs.length));
	return rows.map((r) => {
		const code = `${r.lhs.padEnd(lhsW)} = ${r.rhs}`.replace(/[ \t]+$/, "");
		return r.comment ? `${code}  ${r.comment}` : code;
	});
}

export interface AlignInput {
	/** already trimmed + spaced code lines */
	lines: string[];
	/** for each line: column where the trailing comment starts, or null */
	commentStarts: Array<number | null>;
	alignPorts: boolean;
	alignAssignments: boolean;
}

export function applyAlignment(input: AlignInput): string[] {
	const { lines, commentStarts, alignPorts, alignAssignments } = input;
	const out = lines.slice();

	if (alignPorts) {
		let i = 0;
		while (i < lines.length) {
			const group: PortParts[] = [];
			let j = i;
			while (j < lines.length) {
				const { code, comment } = splitComment(lines[j], commentStarts[j]);
				const parsed = parsePort(code, comment);
				if (!parsed) break;
				group.push(parsed);
				j++;
			}
			if (group.length >= 2) {
				const rendered = renderPortGroup(group);
				for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
				i = j;
			} else {
				i = j > i ? j : i + 1;
			}
		}
	}

	if (alignAssignments) {
		let i = 0;
		while (i < out.length) {
			const rows: Array<{ lhs: string; rhs: string; comment: string }> = [];
			let j = i;
			while (j < out.length) {
				const { code, comment } = splitComment(out[j], commentStarts[j]);
				const m = ASSIGN_RE.exec(code);
				if (!m) break;
				rows.push({ lhs: m[1].replace(/\s+/g, " ").trim(), rhs: m[2].trim(), comment });
				j++;
			}
			if (rows.length >= 2) {
				const rendered = renderAssignGroup(rows);
				for (let k = 0; k < rendered.length; k++) out[i + k] = rendered[k];
				i = j;
			} else {
				i = j > i ? j : i + 1;
			}
		}
	}

	return out;
}
