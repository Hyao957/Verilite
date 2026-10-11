# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VeriLite is a VS Code extension for Verilog **and SystemVerilog**: syntax
highlighting, snippets, completion, a heuristic linter, a formatter, and
single-file navigation (outline / go-to-definition / hover). Everything runs
in-process in TypeScript with **no external toolchain** (no iverilog / verilator
/ verible required).

## Commands

```bash
npm run compile     # tsc -p ./  -> out/
npm run watch       # tsc watch mode
npm test            # pretest compiles test tsconfig, then runs node --test
npm run package     # vsce package -> .vsix (vsce is a devDependency)
```

Press **F5** to launch an Extension Development Host with `test/fixtures/` as
the workspace (see `.vscode/launch.json`).

### Running a single test

Tests are `node:test` files that import from `src/` and are compiled by
`tsconfig.test.json` into `out-test/` before running. You must recompile before
running compiled output directly:

```bash
npm run pretest                                            # compile tests -> out-test/
node --test out-test/test/unit/format.test.js              # one file
node --test --test-name-pattern="idempotent" out-test/test/unit/*.test.js   # by name
```

`npm test` always recompiles first (via `pretest`), so it is the safe default
after editing anything under `src/core` or `src/engine`.

## The central architectural rule

**Nothing under `src/core/` or `src/engine/` may import `vscode`.** The entire
analysis layer is plain TypeScript so it is unit-testable with Node alone.
`src/features/` holds thin `vscode` adapters that call into the engine. When
adding logic, put it in `core/`/`engine/` and keep `features/` a thin wrapper;
the unit tests depend on this separation.

## Dialects (verilog / systemverilog)

`Dialect = "verilog" | "systemverilog"` lives in `src/core/types.ts` (with
`DIALECTS`). Each dialect maps 1:1 onto a VS Code language id, so a dialect
value doubles as a document-selector language. SystemVerilog is a strict
superset of Verilog.

All dialect-specific vocabulary is served by three accessors in
`src/core/keywords.ts` ！ do **not** add new hard-coded keyword lists elsewhere:
- `keywordsFor(d)` ★ `{ control, dataTypes, directives, docs, set }` (the `set`
  drives lexer keyword-vs-identifier classification; the rest drive completion/hover).
- `indentPairsFor(d)` ★ `{ blockPairs, closerToOpeners, indentOpeners,
  indentClosers, statementStarters, declarationStarters, singleStatementHeads }`.
- `systemTasksFor(d)` ★ `$display`-style task names for completion.

The bundles are memoised; `keywordsFor("verilog")` is built from exactly the
legacy constant sets, which is what keeps Verilog byte-for-byte stable.

Threading: `lex`, `lint`/`lintLexed`, `formatText`/`formatSlice`/
`computeStartLevel`/`planIndent`, and `scanSymbols` all take an optional
trailing `dialect` defaulting to `"verilog"`. When you add a new internal call
to any of these, **forward the dialect** (the `formatText`★`joinBegin` recursion
and `formatSlice` are easy to miss). The `src/features/*` provider classes take
`dialect` in their constructor and `src/extension.ts` registers each once per
dialect ！ never duplicate a provider implementation per language.

Known dialect-sensitive constants NOT yet routed through an accessor (they behave
identically for both dialects today; route them via the accessors above before
giving them SV-specific values): `NET_TYPES`/`DIRECTIONS`/`PARAMS`/`MODIFIERS`
in `symbols.ts`; `PORT_RE`/`KEYWORD_PAREN_RE` in `format/align.ts`/`spacing.ts`;
the local block sets inside `lineRule.ts` `caseWithoutDefault`/`assignmentStyle`.

## The masking lexer (read this first)

`src/core/lexer.ts` `lex(text, dialect)` is the foundation everything else
builds on. It produces a **masked mirror** of the source: same length and line
structure, but every comment and string literal replaced by spaces. All later
stages (lint, indent, spacing, alignment, symbols) operate on the mask, so a
stray `end` in a comment can never confuse the block matcher and the formatter
can never reflow a string. `protectedRanges` records where the masked spans were
so the formatter can skip and restore them. `LexResult` also carries
`tokensByLine`, `lineKinds`, `parenDepthAtLineStart`, and
`lineStartsInBlockComment`, which the rules rely on.

## Linter

`src/engine/lint/index.ts` owns a `LINT_RULES` registry of `LintRule` objects
(`{ name, dialects, run(lexed, opts, dialect) }`). The scheduler runs a rule
only when the document's dialect is in its `dialects`, so a dialect-specific
rule is added by registering it there. Rules currently come from:
- `bracketRule` ！ `( [ {` balance plus unterminated string / block comment
  (dialect-independent).
- `pairRule` ！ block-keyword pairing (begin/end, case/endcase, module/endmodule,
  fork/join, `ifdef/`endif, plus interface/class/... for SV) via a stack over
  the token stream; the pair tables come from `indentPairsFor(dialect)`.
- `lineRule` (`LINE_RULES`) ！ missing `;`, code after `endmodule`,
  case-without-default, blocking-in-sequential / non-blocking-in-combinational,
  trailing whitespace. Option-gated rules return `[]` from `run` when their flag
  is off (they are still "run", which keeps ordering / `maxIssues` truncation
  semantics identical).
- `svRule` (`SV_RULES`, `systemverilog`-only) ！ `always_comb` / `always_latch`
  with a sensitivity list and `always_ff` using `*` (sv-always-sensitivity), plus
  `endclass` / `endinterface` / `endpackage` labels that do not match the
  declaration (sv-end-label). `.v` files never see these rules, so the Verilog
  golden snapshots stay byte-for-byte unchanged.

All checks are heuristic and tuned to avoid false positives. Each issue carries
a stable `code` string shown in the Problems panel. `lintLexed` sorts by
(line, col, severity) before truncating, so rule collection order is irrelevant.

## Formatter (idempotent by design)

`src/engine/format/index.ts` `formatText()` runs three passes in order:
1. **indent** (`indent.ts` `planIndent`) ！ one level per block from the masked
   token stream. `module` is special-cased: its body indent is raised by the `;`
   that ends the port list, not by the `module` keyword, so
   `module foo #( ... ) ( ... );` does not double-indent. Single-statement heads
   (`if`/`else`/`for`/`always`...) with no `begin` indent exactly one following
   statement ！ but a look-ahead skips this when the body is a `begin`/`fork`
   block on the next line, letting the block manage its own indent.
2. **spacing** (`spacing.ts`) ！ one space around *unambiguous* binary operators
   only. `: ? + - * / < > & | ^ ~` are deliberately left alone because they are
   ambiguous in Verilog (bit-selects `[7:0]`, case labels, ternaries, unary
   signs, reduction ops, attributes `(* *)`).
3. **alignment** (`align.ts`) ！ column-aligns consecutive port declarations (and
   optionally assignments). Any non-matching line breaks the run, which keeps it
   local and idempotent. The declaration patterns are **per dialect**
   (`patternsFor(dialect)`): the Verilog set is frozen to protect the goldens,
   while the SystemVerilog set additionally accepts the SV data types
   (`time/string/real/...`) and declaration qualifiers (`rand`, `local`,
   `static`, `const`, `var`, ...). `applyAlignment` takes the `dialect`.

`format(format(x)) === format(x)` is enforced by tests ！ preserve this when
changing any pass. `formatSlice` / `computeStartLevel` handle range formatting by
inheriting the indent level of the text above the selection.

## Symbols & navigation

`src/engine/symbols.ts` is a deliberately shallow single-file scanner (no parse
tree): `scanSymbols` collects module/ports/parameters/signals and (for SV) enum
members with line+column, `outlineFile` groups them under their enclosing
container, and `firstModuleName` is a helper. `src/engine/scopes.ts` reuses the
outline to build a container/enum member index (`buildScopeIndex`) cached in
`DocumentAnalysis.scopes`; completion uses it to narrow `pkg::` / `obj.` to the
resolved scope's members. `src/features/navigation.ts` turns the outline into
DocumentSymbol / Definition / Hover providers. There is **no cross-file index**.

## Configuration

`src/config.ts` `readConfig(document)` reads all `verilite.*` settings (declared
in `package.json` `contributes.configuration`), passing the `TextDocument` as the
configuration scope. Every `verilite.*` property is `"scope":
"language-overridable"`, so users can override any setting per language (e.g.
different formatting for `[systemverilog]`). Always pass the document, not just
its URI, or the language axis is lost. Some settings (`lint.external`,
`format.external`) are reserved placeholders for a future release and are not
wired to anything yet.

## Conventions

- **Byte-for-byte Verilog stability is a hard requirement.** `test/unit/golden.test.ts`
  compares `formatText` + `lint` output for every `test/fixtures/*` file against
  snapshots in `test/golden/` (captured pre-dialect-refactor). If you change a
  formatter/linter default that legitimately changes Verilog output, regenerate
  the goldens deliberately ！ never casually.
- Diagnostic / hover / completion user-facing strings are written as Chinese
  literals in `src/features/`, but keyword docs in `src/core/keywords.ts` use
  `\uXXXX` escapes.
- The TextMate grammars (`syntaxes/*.tmLanguage.json`) and snippets
  (`snippets/verilog.json`) are declarative JSON; snippets must remain valid
  *strict* JSON (a stray control character once broke it). SystemVerilog uses a
  thin grammar that just `include`s `source.verilog`; add SV-specific patterns
  there (before the include) when needed. `package.json` registers both
  languages and shares the snippets / language-configuration between them.
- Tests live in `test/unit/` and never import `vscode`. Verilog samples used for
  manual checking live in `test/fixtures/`.
