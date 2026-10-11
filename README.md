# VeriLite ！ Verilog & SystemVerilog Support for VS Code

> Verilog editing, zero setup.

VeriLite gives you syntax highlighting, snippets, completion, lightweight error
checking and a code formatter for Verilog and SystemVerilog ！ **with no external
toolchain**. You do *not* need `iverilog`, `verilator` or `verible` installed.
Everything runs in-process in TypeScript.

`.v` / `.vh` / `.vl` are treated as **Verilog**; `.sv` / `.svh` as
**SystemVerilog** (a superset: extra keywords, system tasks and block pairs such
as `interface`/`endinterface`). Every `verilite.*` setting is
language-overridable, so you can configure the two dialects independently.

---

## Features

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
| Enum members (`IDLE`, `RUN`, ...) | EnumMember |
| Scoped members after `pkg::` / `EnumType::` | Module / EnumMember |
| Members after `obj.` (class / interface instance) | Field / Method |
| UVM base classes after `extends uvm_` | Class |
| UVM classes, phase methods and macros | Class / Method / Function |
| Dialect-specific snippets | Snippet |

Completion never fires inside a comment or a string literal, and local symbols
sort above generic keywords. After `::` or `.` the list narrows to the members
of the resolved scope when it is declared in the same file, and falls back to
every symbol otherwise.

Verilog and SystemVerilog load separate snippet files, so SV-only templates
never appear in `.v` files. Verilog includes templates such as `module`, `case`,
`genfor`, `fsm`, `inst`, `sync2` and `mem`; SystemVerilog includes native
templates such as `always_ff`, `always_comb`, `interface`, `package`, `class`,
`typedefenum`, `property`, `assertp`, `covergroup` and `clocking`.

### 4. Error checking
All checks are heuristic and text-based ！ VeriLite is a *linter*, not a
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
| `always_comb` / `always_latch` with a sensitivity list, `always_ff` using `*` (SV) | Error |
| `endclass` / `endinterface` / `endpackage` label mismatch (SV) | Error |
| Trailing whitespace | Hint (off by default) |

### 5. Formatting
- **Format Document** ！ `Shift+Alt+F`
- **Format Selection** ！ `Ctrl+K Ctrl+F`, correctly inherits the indent level
  of the surrounding block
- **VeriLite: Align Selection** ！ `Ctrl+Alt+A`

Port declarations are column-aligned:

```verilog
input  wire        clk,
input  wire        rst_n,
input  wire [31:0] data_in,
output reg  [ 7:0] data_out
```

The formatter is **idempotent** ！ `format(format(x)) === format(x)` is enforced
by a unit test.

Two opt-in style options (off by default):

| Setting | Effect |
| --- | --- |
| `verilite.format.joinBegin` | merge a lone `begin` line up onto its control head: `always @(...)` ? `begin` ★ `always @(...) begin` |
| `verilite.format.alignIfElse` | column-align the bodies of consecutive single-statement `if` / `else if` / `else` branches. Branches that use `begin`/`end` keep the normal indentation. |

```verilog
// alignIfElse
if (~rst)         lfsr <= 31'h0;
else if (key_en)  lfsr <= {k1, k2};
else              lfsr <= lfsr;
```

### 6. Navigation
- **Document outline** ！ modules appear as top-level nodes with their ports,
  parameters and internal signals nested underneath. Drives the Outline view,
  breadcrumbs and the `Ctrl+Shift+O` / `@:` go-to-symbol pickers.
- **Go to Definition** ！ `F12` on a port, signal, parameter or module name jumps
  to its declaration *within the current file*.
- **Hover** ！ shows a symbol's declaration (`input wire [31:0] din`) and the
  line it is defined on; keywords get a short one-liner.

All three reuse the single-file symbol scanner, so they need no configuration
and no external toolchain. Cross-file navigation is not implemented yet.

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
  extension.ts          activation; registers every provider once per dialect
  config.ts             reads verilite.* settings (language-overridable)
  core/                 <- zero vscode dependency
    types.ts            Dialect ("verilog" | "systemverilog") + token types
    keywords.ts         keywordsFor / indentPairsFor / systemTasksFor (per dialect)
    lexer.ts            masking state machine, lex(text, dialect)
  engine/               <- zero vscode dependency
    symbols.ts          single-file symbol scanner (outline + enum members)
    scopes.ts           container / enum member index for scoped completion
    lint/               LintRule registry (dialects field) + bracket/pair/line rules
    format/             indent / spacing / align (dialect-aware)
  features/             <- thin vscode adapters, each takes a dialect
    completion.ts
    diagnostics.ts
    formatter.ts
    navigation.ts       outline / go-to-definition / hover
    commands.ts
```

The hard rule: **nothing under `core/` or `engine/` may import `vscode`.**
That is why the whole analysis layer is unit-testable with plain Node, and why
the tests in `test/unit/` run in well under a second. A golden-snapshot test
(`test/unit/golden.test.ts`) pins the Verilog formatter/linter output
byte-for-byte, so the dual-dialect work cannot silently change `.v` behaviour.

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

1. **indent** ！ one level per block, computed from the masked token stream.
   `module` is deliberately *not* a normal opener: the body indent is raised by
   the `;` that ends the port list, so `module foo #( ... ) ( ... );` does not
   indent twice.
2. **spacing** ！ one space around unambiguous binary operators only.
   `:` `?` `+` `-` `*` `/` `<` `>` are left alone on purpose, because in Verilog
   they are ambiguous (bit selects `[7:0]`, case labels `2'b00:`, ternaries,
   unary signs, reduction operators, attributes `(*`).
3. **alignment** ！ consecutive port declarations are column-aligned. Any
   non-matching line breaks the run, which keeps the transformation local and
   idempotent. Verilog and SystemVerilog use separate declaration patterns, so
   SystemVerilog ports and members declared with `bit` / `int` / `var` / `time`
   or qualifiers such as `rand` / `local` / `static` align too, while Verilog
   output is left byte-for-byte unchanged.

---

## Known limitations

- Single-file analysis only. The outline, go-to-definition and hover work
  within the current file; there is no cross-file module index yet.
- Verilog-2001 oriented. SystemVerilog constructs highlight, but are not
  deeply understood by the checker.
- The checker is heuristic. It is tuned to avoid false positives, so it will
  miss real errors that only a compiler can find.

---

## Roadmap

| Version | Scope |
| --- | --- |
| v0.1 | zero-dependency basics: highlighting, snippets, completion, lint, format |
| v0.2 | single-file navigation: outline, go to definition, hover |
| v0.3 | independent SystemVerilog highlighting, completion, lint and formatting (this release) |
| v0.4 | cross-file module index, instantiation generation, `begin`-`end` highlighting |
| v0.5 | optional external tools: iverilog / verilator / verible |
| v0.6 | move analysis into a language server |
| v1.0 | full SystemVerilog support |

---

## License

MIT
