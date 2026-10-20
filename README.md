# pi-productivity

A lightweight [`pi-coding-agent`](https://pi.dev) extension that turns the three dimensions of Felix Rieseberg's [*"How to be more ambitious: A tutorial for humans with models"*](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/) into zero-ceremony primitives:

- **Depth (`Alt+D` or `/depth` — Persistent Toggle)**: Multi-turn quality bar. Forces the model to inspect raw workspace material first, open with a 4-line framing (`[Gap]`, `[Raw]`, `[Method]`, `[Judge]`), and run an executable Outside Judge via `bash`.
- **Breadth (`/breadth <task>` — One-Shot Hidden Prompt)**: Explores 3 orthogonal approaches/hypotheses (`[Space]`, `[Disqualifier]`, `[Sweep]`, `[Pick]`), runs fast disqualifiers before coding, and sweeps the entire repo for sibling issues. Automatically expires after the current run finishes so it never pollutes follow-up turns.
- **Horizon (`/horizon <task>` — One-Shot Hidden Prompt)**: Autonomous end-to-end loop (`[Finish Line]`, `[Self-Check Loop]`, `[Boundaries]`, `[Stop Condition]`). Works iteratively until verification passes without stopping halfway to ask permission. Automatically expires after the current run finishes.

## Usage

| Command / Shortcut | Type | When to Use |
|---|---|---|
| **`Alt+D`** or **`/depth`** | **Persistent Toggle** (`⛰️ depth`) | Deep debugging, performance profiling, security/architecture work across multiple turns |
| **`/depth <task>`** | **Enable Toggle + Run** | Turn on Depth mode and immediately send `<task>` |
| **`/breadth <task>`** | **One-Shot Prompt** (`display: false`) | Architecture/design exploration, unknown root cause, or repo-wide bug sweep |
| **`/horizon <task>`** | **One-Shot Prompt** (`display: false`) | Multi-file migrations, end-to-end features, or fixing a chain of failing tests autonomously |

*(Tip: If you already typed a draft in the editor, running `/breadth` or `/horizon` with no arguments will automatically consume your editor draft.)*

## Install

```bash
# Install via Pi package manager
pi install git:github.com/p3psi-boo/pi-productivity

# Or run directly from a local checkout
pi -e ./extensions/depth/index.ts

# Or symlink into ~/.pi/agent/extensions/depth
ln -s "$(pwd)/extensions/depth" ~/.pi/agent/extensions/depth
```

## Development

```bash
bun test
```

## License

MIT
