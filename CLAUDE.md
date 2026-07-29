# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VeriLite is a VS Code extension for Verilog: syntax highlighting, snippets,
completion, a heuristic linter, a formatter, and single-file navigation
(outline / go-to-definition / hover). Everything runs in-process in TypeScript
with **no external toolchain** (no iverilog / verilator / verible required).

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

## The masking lexer (read this first)

`src/core/lexer.ts` `lex()` is the foundation everything else builds on. It
produces a **masked mirror** of the source: same length and line structure, but
every comment and string literal replaced by spaces. All later stages (lint,
indent, spacing, alignment, symbols) operate on the mask, so a stray `end` in a
comment can never confuse the block matcher and the formatter can never reflow a
string. `protectedRanges` records where the masked spans were so the formatter
can skip and restore them. `LexResult` also carries `tokensByLine`, `lineKinds`,
`parenDepthAtLineStart`, and `lineStartsInBlockComment`, which the rules rely on.

## Linter

`src/engine/lint/` composes three rule files in `index.ts`:
- `pairRule` — block-keyword pairing (begin/end, case/endcase, module/endmodule,
  fork/join, `ifdef/`endif) via a stack over the token stream.
- `bracketRule` — `( [ {` balance plus unterminated string / block comment.
- `lineRule` — missing `;`, code after `endmodule`, case-without-default,
  blocking-in-sequential / non-blocking-in-combinational, trailing whitespace.

All checks are heuristic and tuned to avoid false positives. Each issue carries
a stable `code` string shown in the Problems panel.

## Formatter (idempotent by design)

`src/engine/format/index.ts` `formatText()` runs three passes in order:
1. **indent** (`indent.ts` `planIndent`) — one level per block from the masked
   token stream. `module` is special-cased: its body indent is raised by the `;`
   that ends the port list, not by the `module` keyword, so
   `module foo #( ... ) ( ... );` does not double-indent. Single-statement heads
   (`if`/`else`/`for`/`always`...) with no `begin` indent exactly one following
   statement — but a look-ahead skips this when the body is a `begin`/`fork`
   block on the next line, letting the block manage its own indent.
2. **spacing** (`spacing.ts`) — one space around *unambiguous* binary operators
   only. `: ? + - * / < > & | ^ ~` are deliberately left alone because they are
   ambiguous in Verilog (bit-selects `[7:0]`, case labels, ternaries, unary
   signs, reduction ops, attributes `(* *)`).
3. **alignment** (`align.ts`) — column-aligns consecutive port declarations (and
   optionally assignments). Any non-matching line breaks the run, which keeps it
   local and idempotent.

`format(format(x)) === format(x)` is enforced by tests — preserve this when
changing any pass. `formatSlice` / `computeStartLevel` handle range formatting by
inheriting the indent level of the text above the selection.

## Symbols & navigation

`src/engine/symbols.ts` is a deliberately shallow single-file scanner (no parse
tree): `scanSymbols` collects module/ports/parameters/signals with line+column,
`outlineFile` groups them under their enclosing module (modules don't nest), and
`firstModuleName` is a helper. `src/features/navigation.ts` turns these into
DocumentSymbol / Definition / Hover providers. There is **no cross-file index**.

## Configuration

`src/config.ts` `readConfig()` reads all `verilite.*` settings (declared in
`package.json` `contributes.configuration`). Some settings (`lint.external`,
`format.external`) are reserved placeholders for a future release and are not
wired to anything yet.

## Conventions

- Diagnostic / hover / completion user-facing strings are written as Chinese
  literals in `src/features/`, but keyword docs in `src/core/keywords.ts` use
  `\uXXXX` escapes.
- The TextMate grammar (`syntaxes/verilog.tmLanguage.json`) and snippets
  (`snippets/verilog.json`) are declarative JSON; snippets must remain valid
  *strict* JSON (a stray control character once broke it).
- Tests live in `test/unit/` and never import `vscode`. Verilog samples used for
  manual checking live in `test/fixtures/`.
