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

## 可选第三方技能

使用 `--content skills` 时，core workflow skills 会默认安装。
`skills/third-party/` 下的工具型技能需要显式选择，因为它们封装外部工具或
通用效率工作流，不属于 core control loop。

安装全部可选第三方技能：

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex \
  --content skills \
  --skill-categories third-party
```

只安装指定第三方技能：

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex \
  --content skills \
  --skills glab,redmine
```

只有当目标需要一次性接收所有默认和可选技能时，才使用
`--include-optional-skills`。新增 third-party skills 必须保持项目无关，并在
`harness.manifest.json` 中声明 `enabledByDefault: false`。

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

## 已有 ZCode 与 DSH 角色

使用 `harness-deploy` 技能选择最小授权部署范围、核对实际加载目录、保留外部备份并检查技能和角色是否重复。技能复用现有 projector 或所属 overlay 的部署工具。

经当前安装源码确认，ZCode Desktop 和 DSH 能读取共享 `.agents/skills` 根，技能通过 Codex 投影一次。ZCode 原生角色刷新独立于通用四客户端 projector：

```bash
node bin/harness-native-roles.js --client zcode --agents-dir ~/.zcode/agents --dry-run --json > zcode-plan.json
node bin/harness-native-roles.js --client zcode --agents-dir ~/.zcode/agents --from-plan zcode-plan.json --json
node bin/harness-native-roles.js --client zcode --agents-dir ~/.zcode/agents --verify --json
```

应用前检查计划、已有正文及 ZCode Desktop 实际 storage 目录。工具保留 canonical name/description 以外的元数据，拒绝过期计划；多文件失败会报告已更新、失败、未处理角色及备份映射。

DSH 使用随 Core 分发的可选宿主插件，通过原生插件管理器安装到明确选定的 profile：

```bash
dsh plugin --profile <profile-name> add <core-path-or-tarball>
```

bundle 插入一个 `harness-roles` 实例，在激活时读取已安装 Core 的 manifest 及角色文件，让所有 preset 和队友都能调用 `subagent_<role>` 工具。profile 需提供 `tools`、`systemPrompt`、`subagents`，以及支持 persona、工具过滤和深度限制的 provider。默认子智能体 provider 为 `spawn`，`maxDepth: 2`。省略 `agentOptions` 时继承父智能体模型配置，Core 不选择模型。profile 可覆盖 `harness-roles.config`，指定 `agentOptions`、绝对路径 `rolesDir`、provider、深度、额外的 `readOnlyDeny` 或 `policy: false`。只读角色始终禁用 write/edit，但仍可使用 shell，因此这不是沙箱。角色子进程禁用继承的委派、团队控制和角色工具。

迁移时保留选定 profile 和模型设置，移除旧的内嵌 Harness 角色条目及 `@local/dsh-harness-roles` bundle/依赖，再安装 Core bundle，避免两套接入注册同名工具。profile 不再引用外部链接插件后才能删除其目录。`harness-native-roles --client dsh` 已删除。用 `dsh --profile <profile-name> --dump-config` 核对有效配置，再在新会话或明确重载后检查角色工具可见性与派发。源码或打包检查不能证明运行中的 Web 已重载；Core 原生刷新命令不会重启服务。

通用投影的 `--conflict backup` 将快照保存到 `~/backup/agent-harness-core/`，不会在发现根创建备份。
原生刷新复用同一快照所有者，每份私有快照记录 original→saved。保留映射用于恢复，交付后清理已检查的计划文件。
部署时明确选择客户端，避免更新已经停止使用的客户端。

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

使用一个工作循环，由任务条件决定需要哪些材料：

- 措辞、格式或类似的局部修改，不改变行为、接口、生命周期、依赖、迁移或失败契约时，读取当前源码，完成小范围修改并验证。
- 方案已明确且不触发 implementation-design 的有限实现，记录目标、源码范围、不需要 design/pack 的原因、验证及回滚；风险需要时审阅这份计划。
- 方案决策尚未明确时，挑战 proposal、审阅 solution design、判断 implementation-design 触发条件；需要 pack 时先审阅，再创建和审阅 task slices。

每次一般或最终审阅必须覆盖完整任务范围及全部代码/设计维度与项目基线。材料条件、风险和角色分工只影响调查深度及独立性，不减少范围或维度。不适用须经过检查并有证据；缺失证据保留为缺口。共同义务由 `workflow-control` 拥有，代码和设计清单分别由原 multi-lens 技能拥有。

Solution design 决定行为和边界。需要 `implementation-design/` pack 时，它负责把已接受的方案映射到代码归属、依赖方向、运行与失败流程、实施顺序和测试点。文件存在或结构校验通过都不等于获得批准。后续工作如果改变了方案决策，应回到 solution design，并重新检查依赖它的 pack 和 task evidence。

legacy proposal workspace 必须先通过迁移进入 structured layout；不要把 pack 或 task-slice writer 当作隐式迁移手段：

```bash
harness-change-doc --state-root /path/to/repo migrate <change-id> --dry-run
harness-change-doc --state-root /path/to/repo migrate <change-id> --apply
harness-change-validate --state-root /path/to/repo --change <change-id>
```

dry run 会列出 legacy source、archive destination 和将处理的 structured path。apply 会将顶层 legacy review、timeline、task 的精确字节保留到 `.changes/archive/<change-id>/legacy/`，创建 index 和 migration provenance，再删除与 archive 一致的旧入口。archive 或 generated file 存在内容冲突时，会在删除旧入口前停止。进程中断后重新执行 apply 即可；所有顶层 legacy source 都移除后，重复 apply 不再改写 workspace，因此会保留后续编辑。迁移期间只允许一个 writer。它不会创建 implementation-design pack 或 task slice。

只有在上述 validation 成功、solution-design review 已就绪且 trigger 适用时，才创建 pack：

```bash
harness-change-doc --state-root /path/to/repo add-implementation-design <change-id>
```

生成的 `implementation-design/` pack 会区分 `Subsystem` 的 capability 或 runtime 边界与 `Module` 的代码组织边界，然后记录 code topology、file/class mapping、runtime flow、error model、implementation order、constraints 和 traceability。完成 pack 后先审阅，再推导 task slices。

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

self-hosted projection 会创建运行时文件，例如 `.agents/skills/`、`.codex/agents/`、`.codex/hooks/`、`.changes/templates/`、`.rules/` 和 `.harness/projection-state.json`。Core 不选择或安装持久知识提供方；该决定由目标仓库拥有。修改 source directories 和 manifest，然后重新运行 projector；不要手动编辑已投影的 runtime files。

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
