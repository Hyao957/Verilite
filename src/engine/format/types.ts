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
	/** column-align consecutive net / variable declarations (`wire`/`reg`/`logic`/...) */
	alignDeclarations: boolean;
	/** column-align the '=' of consecutive `parameter` / `localparam` initialisations */
	alignParams: boolean;
	/** column-align the '=' of consecutive initialized declarations (wire/reg/logic with =) */
	alignDeclAssignments: boolean;
	/** column-align .port_name(value) connections in module instantiations */
	alignInstancePorts: boolean;
	/** column-align consecutive assignments (<= / =) inside procedural blocks */
	alignBlockAssignments: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
	indentStyle: "space",
	indentSize: 4,
	alignPorts: true,
	alignAssignments: false,
	spaceAroundOperators: true,
	joinBegin: true,
	alignIfElse: true,
	alignDeclarations: true,
	alignParams: true,
	alignDeclAssignments: true,
	alignInstancePorts: true,
	alignBlockAssignments: true,
};

export function indentUnit(options: FormatOptions, level: number): string {
	const n = Math.max(0, level);
	return options.indentStyle === "tab"
		? "\t".repeat(n)
		: " ".repeat(n * options.indentSize);
}
