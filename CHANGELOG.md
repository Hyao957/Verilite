# Changelog

All notable changes to VeriLite are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-09-22

### Added
- **Dual-dialect architecture** — a `Dialect` type (`"verilog" |
  "systemverilog"`) now threads through the lexer, linter, formatter and symbol
  scanner (all take an optional trailing `dialect`, defaulting to `verilog`).
  Dialect vocabulary is served by `keywordsFor(d)` / `indentPairsFor(d)` /
  `systemTasksFor(d)` in `core/keywords.ts`.
- **SystemVerilog language** — `.sv` / `.svh` are registered as a separate
  language (a strict superset of Verilog: extra keywords, system tasks and block
  pairs such as `interface`/`endinterface`, `class`/`endclass`,
  `package`/`endpackage`). Highlighting reuses the Verilog grammar via a thin
  `source.systemverilog` wrapper with SV-specific rules taking precedence.
- **SystemVerilog completion** — dedicated keyword, system-task and snippet
  sets, including `always_ff`, interfaces, packages, classes, typedefs, SVA,
  covergroups and clocking blocks. Verilog files do not receive SV-only
  suggestions.
- **User-defined type navigation** — class names and `typedef` declarations
  (`struct`, `union`, `enum` and aliases) participate in completion, hover and
  same-file go-to-definition. Variables declared with those types are scanned
  as symbols as well.
- **Per-dialect providers** — the Completion, Formatter, Diagnostics and
  Navigation providers each take a `dialect` in their constructor and are
  registered once per language in `extension.ts` (no duplicated
  implementations). Diagnostics uses one collection per dialect.
- **`LintRule` registry** — lint rules are now `{ name, dialects, run }`
  objects; the scheduler runs a rule only when the document's dialect matches,
  so dialect-specific rules can be registered without affecting the other
  dialect.

### Changed
- **Settings are language-overridable** — every `verilite.*` setting now has
  `"scope": "language-overridable"`, and `readConfig` takes the document so
  per-language overrides (e.g. `[systemverilog]`) resolve.
- Verilog and SystemVerilog now use independent snippet files and isolated
  dialect vocabularies, preventing SV-only constructs from leaking into `.v`
  completion or highlighting.

### Guaranteed
- Pure-Verilog (`.v`/`.vh`) formatting and lint output is **byte-for-byte
  unchanged**, pinned by a new golden-snapshot test over `test/fixtures/`.

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
- **Formatter** — a single-statement head whose body is a whole `case ... endcase`
  (e.g. `else` ⏎ `case (s)`) no longer collapses at the first inner `;`; the
  single-statement dedent is now block-depth aware. Case labels ending in `:` are
  also no longer mistaken for a continued expression, so a label's `begin`/`end`
  block aligns correctly.
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
- Unit tests: 56 → 73 (outline grouping, multi-module, loose symbols, name
  columns, next-line-`begin` indentation, `joinBegin`, `alignIfElse`,
  `else`-with-`case` body, case-label blocks).

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
