# VeriLite — Verilog Support for VS Code

> Verilog editing, zero setup.

VeriLite gives you syntax highlighting, snippets, completion, lightweight error
checking and a code formatter for Verilog — **with no external toolchain**.
You do *not* need `iverilog`, `verilator` or `verible` installed. Everything
runs in-process in TypeScript.

---

## Features (v0.1)

### 1. Syntax highlighting
TextMate grammar for `.v`, `.vh` and `.vl` covering keywords, data types, sized
literals (`8'hFF`, `4'b10x1`), system tasks (`$display`), compiler directives
(`` `timescale ``), module names, instance names and port connections.

### 2. Language configuration
- Bracket matching for `()` `[]` `{}`
- Auto-closing and surrounding pairs
- Auto-indent after `begin`, `case`, `fork`, `generate`, `function`, `task`
- Auto-dedent on `end`, `endcase`, `endmodule`, `else`, `)`
- `/** ... */` comment continuation on Enter
- `// region` / `// endregion` folding

### 3. Completion

| Source | Completion kind |
| --- | --- |
| Keywords | Keyword |
| Data types | TypeParameter |
| System tasks (after `$`) | Function |
| Compiler directives (after a backtick) | Reference |
| Module name in the current file | Module |
| Ports / parameters / internal signals | Variable / Constant / Field |
| 14 snippets | Snippet |

Completion never fires inside a comment or a string literal, and local symbols
sort above generic keywords.

**Snippets:** `module` `always_ff` `always_comb` `case` `ifelse` `for` `genfor`
`function` `task` `fsm` `header` `inst` `timescale` `guard`

### 4. Error checking
All checks are heuristic and text-based — VeriLite is a *linter*, not a
compiler. It will not catch type errors, but it does catch the mistakes you
actually make while typing.

| Rule | Severity |
| --- | --- |
| Unmatched / mismatched `begin`-`end`, `case`-`endcase`, `module`-`endmodule`, `fork`-`join`, ifdef-endif | Error |
| Unbalanced `(` `[` `{` | Error |
| Unterminated string or block comment | Error |
| Missing `;` on a declaration line | Error |
| Code after `endmodule` | Error |
| `always` with no sensitivity list | Warning |
| `case` with no `default` branch | Warning |
| Blocking `=` in a sequential block | Warning |
| Non-blocking `<=` in a combinational block | Warning |
| Trailing whitespace | Hint (off by default) |

### 5. Formatting
- **Format Document** — `Shift+Alt+F`
- **Format Selection** — `Ctrl+K Ctrl+F`, correctly inherits the indent level
  of the surrounding block
- **VeriLite: Align Selection** — `Ctrl+Alt+A`

Port declarations are column-aligned:

```verilog
input  wire        clk,
input  wire        rst_n,
input  wire [31:0] data_in,
output reg  [ 7:0] data_out
```

The formatter is **idempotent** — `format(format(x)) === format(x)` is enforced
by a unit test.

---

## Getting started

```bash
npm install
npm run compile
```

Then press **F5** in VS Code. A second window opens with the extension loaded
and `test/fixtures/` as its workspace folder.

| Fixture | What to look for |
| --- | --- |
| `counter.v` | clean file, zero diagnostics |
| `fsm.v` | three-process FSM, zero diagnostics |
| `defines.vh` | nested conditional compilation |
| `broken.v` | every diagnostic at once |
| `messy.v` | press `Shift+Alt+F` |

Run the tests:

```bash
npm test
```

Package a `.vsix`:

```bash
npm i -g @vscode/vsce
vsce package
```

Before publishing, replace `publisher` in `package.json` with your real
Marketplace publisher id.

---

## Architecture

```
src/
  extension.ts          activation and wiring
  config.ts             reads verilite.* settings
  core/                 <- zero vscode dependency
    types.ts
    keywords.ts         vocabulary and block pair table
    lexer.ts            masking state machine
  engine/               <- zero vscode dependency
    symbols.ts          single-file symbol scanner
    lint/               pairRule / bracketRule / lineRule
    format/             indent / spacing / align
  features/             <- thin vscode adapters
    completion.ts
    diagnostics.ts
    formatter.ts
    commands.ts
```

The hard rule: **nothing under `core/` or `engine/` may import `vscode`.**
That is why the whole analysis layer is unit-testable with plain Node, and why
the 56 tests in `test/unit/` run in well under a second.

### The masking lexer

Everything rests on one idea. `lex()` produces a *masked mirror* of the source
with exactly the same length and line structure, but with every comment and
string literal replaced by spaces:

```
source:  assign x = y; // end of begin
masked:  assign x = y;
```

Every later stage works on the mask, which is why a stray `end` inside a
comment can never confuse the block matcher, and why the formatter can never
reflow the inside of a string. `protectedRanges` records where those masked
spans were, so the formatter can skip them and put them back untouched.

This is the single most common source of bugs in text-based HDL tooling, and
solving it once at the bottom of the stack removes it from every rule above.

### Formatter passes

1. **indent** — one level per block, computed from the masked token stream.
   `module` is deliberately *not* a normal opener: the body indent is raised by
   the `;` that ends the port list, so `module foo #( ... ) ( ... );` does not
   indent twice.
2. **spacing** — one space around unambiguous binary operators only.
   `:` `?` `+` `-` `*` `/` `<` `>` are left alone on purpose, because in Verilog
   they are ambiguous (bit selects `[7:0]`, case labels `2'b00:`, ternaries,
   unary signs, reduction operators, attributes `(*`).
3. **alignment** — consecutive port declarations are column-aligned. Any
   non-matching line breaks the run, which keeps the transformation local and
   idempotent.

---

## Known limitations

- Single-file analysis only. No cross-file module index, no go-to-definition.
- Verilog-2001 oriented. SystemVerilog constructs highlight, but are not
  deeply understood by the checker.
- The checker is heuristic. It is tuned to avoid false positives, so it will
  miss real errors that only a compiler can find.

---

## Roadmap

| Version | Scope |
| --- | --- |
| v0.1 | zero-dependency basics (this release) |
| v0.2 | symbol navigation, `begin`-`end` highlighting, hover port list |
| v0.3 | cross-file module index, go to definition, instantiation generation |
| v0.4 | optional external tools: iverilog / verilator / verible |
| v0.5 | move analysis into a language server |
| v1.0 | full SystemVerilog support |

---

## License

MIT
