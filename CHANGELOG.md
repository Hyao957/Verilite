# Changelog

All notable changes to VeriLite are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-27

First release. Zero external dependencies.

### Added
- **Syntax highlighting** — TextMate grammar for `.v`, `.vh`, `.vl` covering
  comments, strings, compiler directives, sized literals, data types, control
  keywords, system tasks, module declarations, instantiations, port
  connections, operators and escaped identifiers.
- **Language configuration** — bracket matching, auto-closing pairs,
  `begin`/`end` aware indent rules, block comment continuation, region folding.
- **Completion** — keywords, data types, system tasks (after `$`), compiler
  directives (after a backtick), plus the module name, ports, parameters and
  internal signals declared in the current file. Suppressed inside comments
  and strings. Results cached per document version.
- **Snippets** — 14 templates including a three-process FSM, a file header
  block and a module instantiation skeleton.
- **Error checking** — 5 error rules, 4 warning rules and 1 hint rule, all
  running on a masked mirror of the source so comments and strings can never
  produce false positives. Debounced while typing, configurable to run on save
  or manually only.
- **Formatting** — Format Document, Format Selection and Align Selection.
  Three passes: indent, spacing, port alignment. Guaranteed idempotent.
- **Commands** — `VeriLite: Check Current File`,
  `VeriLite: Clear All Diagnostics`, `VeriLite: Insert File Header`,
  `VeriLite: Align Selection`.
- **Settings** — 14 active `verilite.*` settings plus 3 reserved for v0.2.
- **Tests** — 56 unit tests over the lexer, linter, formatter and symbol
  scanner, plus 5 Verilog fixtures.

### Notes
- `always` with no sensitivity list is reported as a **warning**, not an error.
  `always begin #5 clk = ~clk; end` is legal in a testbench, and treating it as
  an error produced too many false positives.
- The formatter deliberately does not touch `:` `?` `+` `-` `*` `/` `<` `>`.
  These are ambiguous in Verilog and normalising them causes more damage than
  it fixes.
