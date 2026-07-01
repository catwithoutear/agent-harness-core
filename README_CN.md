# Agent Harness Core

面向仓库感知 AI 工作流的通用多客户端 agent harness core。

English: [README.md](README.md)。

本包提供可复用的工作流契约、change workspace 工具、memory 契约、skills、subagents、hooks、slash command prompts 以及客户端投影工具。它是与项目无关的 core layer：产品、组织、代码库、构建和领域知识应放在 overlay 或目标仓库中，而不是放在本包里。

## 提供内容

| Surface | 用途 |
|---|---|
| `harness-project` | 将 core harness 资产投影到仓库或用户作用域。 |
| `harness-change-doc` | 创建、定位、索引和更新受规约管理的 change workspace 文档。 |
| `harness-change-validate` | 验证 change workspace 和 memory 契约。 |
| `harness` | 包辅助命令，包括 `harness manifest`。 |
| `harness.manifest.json` | 可安装资产、客户端目标和能力的事实源。 |
| `skills/` | 分类存放的 source skills；运行时 skill 目录会被投影为扁平结构。 |
| `agents/roles/` | canonical source subagent roles；各客户端文件由这些 source 渲染生成。 |
| `rules/` | 稳定的工作流契约。 |
| `hooks/intents/` | 会被渲染为客户端特定 hook payload 的 hook intent 描述。 |
| `commands/harness/` | 支持 command projection 的客户端使用的 slash command prompt source。 |
| `templates/` | 通用 change、memory 和 spec 模板。 |

## 安装到仓库

使用 `harness-project` 完整安装 harness。Skill-only installer 可以安装单个 skill，但不会安装 rules、tools、templates、subagents、hooks 或 project memory。Commands 也不属于 skill-only 安装路径。

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex,claude,opencode,omp \
  --content rules,templates,skills,subagents,hooks
```

默认投影模式是真实物化复制。只有在明确进行本地 harness 开发，并且目标仓库可以依赖 source checkout 时，才使用 `--mode symlink`。

写入目标仓库前先使用 `--dry-run --json`：

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex \
  --content rules,templates,skills,subagents,hooks \
  --dry-run --json
```

验证已安装投影：

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex \
  --content rules,templates,skills,subagents,hooks \
  --verify --json
```

## AI 安装提示词

当你希望 AI coding agent 安装 core harness 时，将下面其中一段提示词复制给它。运行命令前替换占位符。

### Project Scope

```text
Install Agent Harness Core into this repository.

Use a real copy install, not symlinks. First inspect the current git status and
do not overwrite unrelated user changes. Then run a dry-run:

node <agent-harness-core>/bin/harness-project.js \
  --target <repo> \
  --clients codex,claude,opencode,omp \
  --scope project \
  --content rules,templates,skills,subagents,hooks,commands \
  --mode copy \
  --conflict backup \
  --dry-run --json

Explain the planned targets, conflicts, and unsupported-client warnings. If the
plan is acceptable, run the same command without --dry-run. Then verify by
replacing --dry-run --json with --verify --json.

Keep generated runtime files as projection outputs. Edit source assets and
rerun the projector instead of hand-editing projected files.
```

### User Global Scope

```text
Install Agent Harness Core into my user-global agent environment.

Confirm this is intended because global assets affect every repository for this
user. Do not project repository rules or templates globally. Use a real copy
install, not symlinks. Use <state-target> only for projection state; do not
choose an unrelated repository unless it is acceptable to write
.harness/projection-state.json there.

First run:

node <agent-harness-core>/bin/harness-project.js \
  --target <state-target> \
  --clients codex,claude,opencode,omp \
  --scope global \
  --content skills,subagents,hooks,commands \
  --mode copy \
  --conflict backup \
  --dry-run --json

For Codex, command prompts project to ~/.codex/prompts/ and are deprecated
personal shortcuts; prefer skills for shared reusable behavior. If the dry-run
is acceptable, run the same command without --dry-run. Then verify by replacing
--dry-run --json with --verify --json.
```

## User-Global Agent Constitution

可复用的 user-global instruction template 位于 `templates/user-global/AGENTS.md`。

这个模板仅作为文档提供。它不会列入 `harness.manifest.json`，不会由 `harness-project` 投影，也不会自动写入任何 user-global `AGENTS.md`。

仅在用户明确要求安装或更新 global agent instructions 时使用它：

```text
Install the Agent Harness Core user-global constitution into my user-global
agent instructions.

Read templates/user-global/AGENTS.md first. Compare it with my existing
user-global AGENTS.md or equivalent global instruction file. Propose the exact
merge, explain conflicts or duplicated rules, and wait for confirmation before
writing any global file.
```

## Change Workspace Design Packs

当 implementation-design trigger rule 适用时，先创建详细设计 topology pack，再推导 task slices：

```bash
harness-change-doc --repo-root /path/to/repo add-implementation-design <change-id>
```

生成的 `implementation-design/` pack 会区分 `Subsystem` 的 capability 或 runtime 边界与 `Module` 的代码组织边界，然后记录 code topology、file/class mapping、runtime flow、error model、implementation order、constraints 和 traceability。

## Self-Host The Core For Codex

本仓库可以从 source assets 安装自己的 Codex-facing runtime projection。使用同一套 harness 开发 harness 本身时，这很有用。

```bash
node bin/harness-project.js \
  --target . \
  --clients codex \
  --content rules,templates,skills,subagents,hooks \
  --conflict overwrite \
  --json
```

然后验证：

```bash
node bin/harness-project.js \
  --target . \
  --clients codex \
  --content rules,templates,skills,subagents,hooks \
  --verify --json
```

self-hosted projection 会创建运行时文件，例如 `.agents/skills/`、`.codex/agents/`、`.codex/hooks/`、`.changes/templates/`、`.memory/`、`.rules/` 和 `.harness/projection-state.json`。修改 source directories 和 manifest，然后重新运行 projector；不要手动编辑已投影的 runtime files。

## Slash Commands

core package 在 `commands/harness/` 下提供 workflow command prompts。`harness-project --content commands` 只会投影到 `harness.manifest.json` 中明确声明支持 command surface 的客户端。

| Prompt | 用途 |
|---|---|
| `harness route` | 选择最小且正确的 skill、command、agent、hook 或 projection path。 |
| `harness workflow` | 在非平凡任务上运行 evidence-gated workflow loop。 |
| `harness plan` | 将已确定的 design artifacts 转换为有边界的 task slices 和 validation gates。 |
| `harness verify` | 选择、运行并报告最小可信 validation loop。 |
| `harness review` | 以 evidence-first findings 和 gate decisions 审阅目标。 |
| `harness handoff` | 为另一个 agent 或未来 session 生成紧凑 handoff packet。 |

这些 prompts 不替代 skills。它们负责把模型路由到正确的 skill 或 command，并让不同客户端上的执行形状保持一致。

不同客户端的 command 支持并不一致：

| Client | Projection target | Invocation |
|---|---|---|
| Claude | `.claude/commands/harness/*.md` 或 `~/.claude/commands/harness/*.md` | `/harness:workflow` |
| OMP | `.omp/commands/harness-*.md` 或 `~/.omp/agent/commands/harness-*.md` | `/harness-workflow` |
| Codex | 仅 global：`~/.codex/prompts/harness-*.md` | `/prompts:harness-workflow` |
| OpenCode | 尚未 file-projected；OpenCode 使用 `opencode.json` 的 `command` entries | 使用 projected skills |

Codex custom prompts 已被 Codex 标记为 deprecated，应视为 personal shortcuts，而不是主要的共享 workflow surface。OpenCode command support 需要 config merge semantics 后，core 才能安全投影。

## Development

运行默认测试：

```bash
npm test
```

直接验证 manifest：

```bash
node bin/harness.js manifest --json
```

修改 source assets 后，handoff 前推荐运行：

```bash
npm test
node bin/harness.js manifest --json
node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json
git diff --check
```

## Ownership Rules

- 保持本包与项目无关。不要向 core assets 添加目标仓库事实、产品专属工作流、私有主机名、issue tracker 假设或构建系统细节。
- 将稳定契约放在 `rules/`，可执行 policy 放在 `lib/`，操作 prompts 放在 `skills/`，客户端投影放在 `harness-project` 后面。
- Runtime projections 是生成产物。应修改 source asset 和 manifest entry，然后重新投影。
- 每次新增、重命名或删除 asset 时，都要让 `harness.manifest.json` 保持同步。
