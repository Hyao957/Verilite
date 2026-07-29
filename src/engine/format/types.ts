export interface FormatOptions {
	indentStyle: "space" | "tab";
	indentSize: number;
	alignPorts: boolean;
	alignAssignments: boolean;
	spaceAroundOperators: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
	indentStyle: "space",
	indentSize: 4,
	alignPorts: true,
	alignAssignments: false,
	spaceAroundOperators: true,
};

export function indentUnit(options: FormatOptions, level: number): string {
	const n = Math.max(0, level);
	return options.indentStyle === "tab"
		? "\t".repeat(n)
		: " ".repeat(n * options.indentSize);
}
