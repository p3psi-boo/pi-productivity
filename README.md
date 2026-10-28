# pi-productivity

A lightweight [`pi-coding-agent`](https://pi.dev) extension organized around **real developer workflows** rather than abstract paper terminology. It fuses Felix Rieseberg's [*"How to be more ambitious: A tutorial for humans with models"*](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/), Uncle Bob's [`ub-mode`](https://github.com/unclebob/ub-mode) (*First Make it Work, Then Make it Right, Follow Practice*), and [`BeautyyuYanli/abyss`](https://github.com/BeautyyuYanli/abyss) multi-session subagent orchestration into **2 persistent mode toggles** and **5 one-shot scenario commands**:

## 1. Persistent Mode Toggles (Can be active individually or together)

- **Debug (`Alt+D` or `/debug` — `🔍 debug` — `<debug>` section)**:
  Root-cause investigation & verification mode. Forces the model to inspect raw workspace material first, open with a 4-line framing (`[Gap]`, `[Raw]`, `[Method]`, `[Judge]`), reproduce and fix root causes (never hide crashes behind shallow guards), discard broken premises when two fixes fail the same gate (*Attack the Premise*), and run an executable Outside Judge via `bash`.
- **TDD (`Alt+T` or `/tdd` — `🧪 tdd` — `<tdd>` section)**:
  Disciplined everyday coding mode (*First Make it Work*). Enforces data-shape-first design, domain types that make illegal states unrepresentable, boundary parsing with pure core functions, subtracting complexity before adding new code, and strict behavioral Red-Green-Refactor TDD (testing externally observable outcomes, never implementation details).

## 2. Solo Scenario Commands (One-Shot Sections — apply to the next run only)

- **Explore (`/explore <task>` — `<explore>` section)**:
  Maps 3 orthogonal approaches or root-cause hypotheses (`[Space]`, `[Disqualifier]`, `[Sweep]`, `[Pick]`), runs fast disqualifiers before writing production changes, discards shared broken premises, and sweeps the entire repository (`rg`/`ast-grep`) for sibling occurrences.
- **Drive (`/drive <task>` — `<drive>` section)**:
  Autonomous end-to-end execution loop (`[Finish Line]`, `[Self-Check Loop]`, `[Boundaries]`, `[Stop Condition]`). Sequences work into small verifiable units, builds deterministic levers/scripts for repetitive work (*Build the Lever*), and iterates until verification passes without stopping halfway to ask permission.
- **Refactor (`/refactor <task>` — `<refactor>` section)**:
  Cleans up working code (*Then Make it Right*). Opens with a 4-line refactoring frame (`[Pin]`, `[Hotspots]`, `[Mutations]`, `[Proof]`), pins behavior with user-facing tests (deleting implementation-coupled mock tests), reduces function complexity (`CRAP < 10`), eliminates structural duplication (`Dryer < 0.8`), kills surviving mutants (`Mutator`), and deletes dead code.

## 3. Multi-Agent Orchestration Workflows (Backed by bundled [`pi-subagent-manager`](https://github.com/championswimmer/pi-subagent-manager))

Installing `pi-productivity` automatically provides `/agents` and all `agent_*` tools via `pi-subagent-manager`:

- **Design (`/design <task>` — `<design>` section)**:
  Drafts an implementation-focused architecture proposal at `.context/proposals/YYMMDD-<slug>.md` (Persona Mei + `ub-mode` Foundational Thinking: data shapes first, illegal states unrepresentable, boundary discipline, idempotency, state isolation), spawns a clean-slate `/abyss-proposal-review` subagent (`history: none`) to enforce *Subtract Before You Add* and *Laziness Protocol*, simplifies in place, and delivers.
- **Deliver (`/deliver <task>` — `<deliver>` section)**:
  Coordinator-driven implementation & quality-gate loop (`/root` never edits code directly). Delegates coding to `/abyss-implementer` (Persona Elysia + *First Make it Work*: behavioral TDD, pure boundaries, verifiable units, action log), fans out 5 parallel blind reviewers (Persona Eden with P0–P3 classification):
  - `/abyss-review-code-hygiene`: **Crapper** (`CRAP < 10`), **Dryer** (duplication `< 0.8`), dead code & overengineering removal
  - `/abyss-review-correctness`: Domain invariants, boundary parsing, idempotency, state isolation, root-cause fixes
  - `/abyss-review-test-hygiene`: **Test Behavior, Not Implementation** (deletes tests that pass when functions return nothing)
  - `/abyss-review-test-adequacy`: **Mutator** discipline (identifies surviving mutants across changed branches/boundaries)
  - `/abyss-review-documentation`: Domain glossary consistency & non-obvious invariant documentation

  `/root` validates all findings against raw workspace evidence to drop noise, reuses the exact same 6 subagent threads via `agent_steer` across rework rounds, and publishes `.context/impl/YYMMDD-<slug>.md`.

## Usage Matrix

| Command / Shortcut | Type | Developer Scenario |
|---|---|---|
| **`Alt+D`** or **`/debug`** | **Persistent Toggle** (`🔍 debug`) | Diagnosing tricky bugs, performance bottlenecks, or security issues with raw evidence & Outside Judge verification |
| **`/debug <task>`** | **Enable Toggle + Run** | Turn on Debug mode and immediately run `<task>` |
| **`Alt+T`** or **`/tdd`** | **Persistent Toggle** (`🧪 tdd`) | Everyday feature coding with data-shape-first design, pure boundaries, and behavioral Red-Green-Refactor TDD |
| **`/tdd <task>`** | **Enable Toggle + Run** | Turn on TDD mode and immediately run `<task>` |
| **`/explore <task>`** | **One-Shot Section** (`<explore>`) | Comparing architectural options, narrowing down unknown root causes, or sweeping the repo for sibling bugs |
| **`/drive <task>`** | **One-Shot Section** (`<drive>`) | Multi-file migrations, mechanical features, or fixing a chain of failing tests autonomously end-to-end |
| **`/refactor <task>`** | **One-Shot Section** (`<refactor>`) | Cleaning up working code to hit `CRAP < 10`, `< 0.8` duplication, behavioral tests, and zero surviving mutants |
| **`/design <task>`** | **One-Shot Section** (`<design>`) | Drafting or revising a technical design in `.context/proposals/` with an independent complexity-stripping review |
| **`/deliver <task>`** | **One-Shot Section** (`<deliver>`) | Implementing a feature or `.context/proposals/*.md` with 1 TDD implementer + 5-way blind review loop |

*(Tip: If you already typed a draft in the editor, running `/explore`, `/drive`, `/refactor`, `/design`, or `/deliver` with no arguments will automatically consume your editor draft.)*

## How protocols reach the model

All protocols are delivered as **system prompt sections** (`<debug>`, `<tdd>`, `<explore>`, `<drive>`, `<refactor>`, `<design>`, `<deliver>`) written from `before_agent_start` into `event.systemPromptOptions.sections`:

- A persistent toggle costs exactly one section per request instead of one hidden message per turn, so a long session does not accumulate copies of the protocol.
- Pi patches only the sections that changed, so the prompt prefix stays stable and cacheable.
- Sections are rebuilt for every request, which keeps them effective across compaction.

## Install

```bash
# Install via Pi package manager (automatically installs and registers pi-subagent-manager)
pi install git:github.com/p3psi-boo/pi-productivity

# Or run directly from a local checkout
pi -e .
```

## Development

```bash
bun test
```

## License

MIT
