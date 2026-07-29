export interface FormatOptions {
	indentStyle: "space" | "tab";
	indentSize: number;
	alignPorts: boolean;
	alignAssignments: boolean;
	spaceAroundOperators: boolean;
	/** merge a lone `begin` line up onto its control head (`always @(...) begin`) */
	joinBegin: boolean;
	/** column-align the bodies of single-statement if / else-if / else chains */
	alignIfElse: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
	indentStyle: "space",
	indentSize: 4,
	alignPorts: true,
	alignAssignments: false,
	spaceAroundOperators: true,
	joinBegin: false,
	alignIfElse: false,
};

export function indentUnit(options: FormatOptions, level: number): string {
	const n = Math.max(0, level);
	return options.indentStyle === "tab"
		? "\t".repeat(n)
		: " ".repeat(n * options.indentSize);
}
