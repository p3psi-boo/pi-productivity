# pi-productivity

A lightweight [`pi-coding-agent`](https://pi.dev) extension that turns the three dimensions of Felix Rieseberg's [*"How to be more ambitious: A tutorial for humans with models"*](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/) into zero-ceremony primitives:

- **Depth (`Alt+D` or `/depth` — Persistent Toggle)**: Multi-turn quality bar. Forces the model to inspect raw workspace material first, open with a 4-line framing (`[Gap]`, `[Raw]`, `[Method]`, `[Judge]`), and run an executable Outside Judge via `bash`.
- **Breadth (`/breadth <task>` — One-Shot Section)**: Explores 3 orthogonal approaches/hypotheses (`[Space]`, `[Disqualifier]`, `[Sweep]`, `[Pick]`), runs fast disqualifiers before coding, and sweeps the entire repo for sibling issues. Applies to the next run only, so it never pollutes follow-up turns.
- **Horizon (`/horizon <task>` — One-Shot Section)**: Autonomous end-to-end loop (`[Finish Line]`, `[Self-Check Loop]`, `[Boundaries]`, `[Stop Condition]`). Works iteratively until verification passes without stopping halfway to ask permission. Applies to the next run only.

Plus **Abyss multi-session subagent orchestration** (inspired by [`BeautyyuYanli/abyss`](https://github.com/BeautyyuYanli/abyss), with [`pi-subagent-manager`](https://github.com/championswimmer/pi-subagent-manager) bundled as a dependency so installing `pi-productivity` automatically provides `/agents` and all `agent_*` tools):

- **Proposal (`/proposal <task>` — One-Shot Section `<proposal>`)**: Drafts an implementation-focused proposal at `.context/proposals/YYMMDD-<slug>.md` (Persona Mei, no operational/rollout fluff), spawns a clean-slate `/abyss-proposal-review` subagent (`history: none`) solely to strip overengineering, applies simplifications in place, and delivers.
- **Impl (`/impl <task>` — One-Shot Section `<impl>`)**: Coordinator-driven implementation loop (`/root` never edits code directly). Delegates implementation to `/abyss-implementer` (Persona Elysia), fans out 5 parallel blind reviewers (`/abyss-review-code-hygiene`, `/abyss-review-correctness`, `/abyss-review-test-hygiene`, `/abyss-review-test-adequacy`, `/abyss-review-documentation` as Persona Eden with P0–P3 priority classification), validates findings in `/root` against raw workspace evidence to drop noise, reuses the exact same 6 subagent threads via `agent_steer` across rework rounds, and publishes `.context/impl/YYMMDD-<slug>.md`.

## How protocols reach the model

All protocols are delivered as **system prompt sections** (`<depth>`, `<breadth>`, `<horizon>`, `<proposal>`, `<impl>`) written from `before_agent_start` into `event.systemPromptOptions.sections`:

- A persistent toggle costs exactly one section per request instead of one hidden message per turn, so a long session does not accumulate copies of the protocol.
- Pi patches only the sections that changed, so the prompt prefix stays stable and cacheable.
- Sections are rebuilt for every request, which keeps them effective across compaction.
- Earlier releases injected hidden custom messages instead; a `context` handler still strips those legacy messages from resumed sessions.

## Usage

| Command / Shortcut | Type | When to Use |
|---|---|---|
| **`Alt+D`** or **`/depth`** | **Persistent Toggle** (`⛰️ depth`) | Deep debugging, performance profiling, security/architecture work across multiple turns |
| **`/depth <task>`** | **Enable Toggle + Run** | Turn on Depth mode and immediately send `<task>` |
| **`/breadth <task>`** | **One-Shot Section** (`<breadth>`) | Architecture/design exploration, unknown root cause, or repo-wide bug sweep |
| **`/horizon <task>`** | **One-Shot Section** (`<horizon>`) | Multi-file migrations, end-to-end features, or fixing a chain of failing tests autonomously |
| **`/proposal <task>`** | **One-Shot Section** (`<proposal>`) | Design or revise a proposal with an independent clean-slate complexity/overengineering review |
| **`/impl <task>`** | **One-Shot Section** (`<impl>`) | Implement a task or `.context/proposals/*.md` with 5-way parallel blind review & stateful rework loop |
| **`/abyss <proposal\|impl> <task>`** | **One-Shot Section** | Umbrella command for `proposal` and `impl` (also accepts `workflow:proposal` / `workflow:impl`) |

*(Tip: If you already typed a draft in the editor, running `/breadth`, `/horizon`, `/proposal`, or `/impl` with no arguments will automatically consume your editor draft.)*

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

### Verify against a real session

`bun test` covers the pure helpers and the extension wiring. To confirm what the model actually receives, drive `pi --mode rpc` and inspect the transcript's system-message sections:

```bash
pi --mode rpc --no-session --no-extensions \
  -e /path/to/pi-magpie-provider -e ./extensions/depth/index.ts --model <model>
```

Then send `{"type":"prompt","message":"/depth on"}`, run one turn, and check `get_messages` for a single `sections.depth` entry that contains `[DEPTH MODE ACTIVE`. Use `--no-extensions` when a globally installed copy of this package exists, otherwise both copies register `/depth` and pi renames them to `depth:1`/`depth:2`.

## License

MIT
