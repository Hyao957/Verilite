# Changelog

All notable changes to VeriLite are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-07-29

### Added
- **Navigation** — a document outline (modules as top-level nodes with their
  ports, parameters and internal signals nested underneath), same-file
  **Go to Definition** (`F12`) and **Hover** summaries. All three reuse the
  existing single-file symbol scanner, so they need no configuration and no
  external toolchain. The scanner now records the column of each declared name
  for precise jumps, and a new `outlineFile()` groups symbols under their
  enclosing module.
- **Formatter, opt-in** — `verilite.format.joinBegin` merges a lone `begin` line
  up onto its control head (`always @(...) begin`), and
  `verilite.format.alignIfElse` column-aligns the bodies of consecutive
  single-statement `if` / `else if` / `else` branches (branches that use
  `begin`/`end` keep the normal indentation). Both default to off.
- `repository` / `bugs` fields in `package.json` (placeholder URLs — replace
  before publishing).

### Fixed
- **Formatter** — a `begin`/`end` block whose head (`always @(...)`, `if (...)`,
  `else`, ...) sat on the previous line no longer collapses the indent of the
  block body and its `else` chain; `end` now aligns with `begin`. Also normalises
  `always@(` to `always @(`.
- `snippets/verilog.json` contained a stray control character (a literal tab
  inside `"TOD<TAB>O 注释"`) that made it invalid strict JSON. Corrected to
  `"TODO 注释"`.
- The completion provider now disposes its document-close listener instead of
  leaking it for the extension's lifetime.
- Removed a dead, commented-out duplicate of the completion `makeItem` helper.
- `VeriLite: Clear All Diagnostics` now only appears in the command palette for
  Verilog files, matching the other commands.
- Packaging: `.claude/` and `*.vsix` are excluded from the bundle, and
  `@vscode/vsce` is now a dev dependency so `npm run package` works out of the
  box. The stale root `.vsix` is no longer committed.

### Changed
- Unit tests: 56 → 71 (outline grouping, multi-module, loose symbols, name
  columns, next-line-`begin` indentation, `joinBegin`, `alignIfElse`).

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
- **Snippets** — 48 templates including a three-process FSM, a file header
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
