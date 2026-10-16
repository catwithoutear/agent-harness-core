/**
 * Harness role specialists as host-plane delegation tools.
 *
 * Canonical role definitions ship in the agent-harness-core package
 * (`<rolesDir>/<slug>.md`, YAML frontmatter + role body). This plugin reads that
 * directory at activation and registers one global tool per role, so the roles
 * are available in every preset and to every Agent Team member — unlike preset
 * rows, which only exist in the preset that declares them.
 *
 * Each call goes through the shared `subagents` service with the role body as
 * the child's scoped persona, optional profile-owned `agentOptions`, and an
 * absolute delegation-depth cap. Role children additionally deny the role tools
 * themselves, so a role stays a leaf even though teammates may dispatch one.
 *
 * Dependency-free on purpose: no bare imports, so the module never depends on
 * how the profile resolves DSH packages.
 *
 * @module @catwithoutear/agent-harness-core
 */
import { readFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'harness-roles'
export const inject = ['tools', 'subagents', 'systemPrompt']

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DEFAULT_ROLES_DIR = join(PACKAGE_ROOT, 'agents/roles')
const DEFAULT_PROVIDER = 'spawn'
const DEFAULT_MAX_DEPTH = 2
const DEFAULT_READ_ONLY_DENY = ['write', 'edit']
const ROLE_TOOL_PREFIX = 'subagent_'
const DELEGATION_TOOLS = [
  'subagent', 'subagent_fork', 'spawn_teammate', 'send_message', 'list_agents',
  'wait_agent', 'interrupt_agent', 'team_task_create', 'team_task_list',
  'team_task_get', 'team_task_update', 'summon_expert',
]

/** Preserve the role packet contract in the child persona. */
const PERSONA_HEAD = (slug) =>
  `You are the \`${slug}\` specialist subagent of a DeepSeek Harness agent. ` +
  'The parent agent\'s dispatch prompt is your Input Packet. Follow the role ' +
  'definition below exactly: respect its Authority, Required Inputs, stop ' +
  'conditions, and Output Packet contract, and return the Output Packet as ' +
  'your final message.\n\n'

const POLICY_SECTION = [
  '## Delegation surfaces',
  '',
  'Three delegation surfaces exist and they are not interchangeable.',
  '',
  '**Role specialists** (`subagent_<role>`) — one bounded slice that plainly matches a role:',
  '`subagent_repo_mapper` (map ownership and flow), `subagent_solution_designer` (settle one design),',
  '`subagent_implementation_planner` (slice frozen requirements), `subagent_planning_reviewer` (plan gate),',
  '`subagent_code_worker` (implement one approved slice), `subagent_code_simplifier` (behavior-preserving cleanup),',
  '`subagent_reviewer` (correctness review), `subagent_review_verifier` (independent review-coverage audit),',
  '`subagent_design_alternatives` (orthogonal options), `subagent_council_synthesizer` (evidence-weighted synthesis),',
  '`subagent_harness_orchestrator` (multi-phase coordination). Each returns an Output Packet; the read-only roles',
  'deny the write/edit tools; shell access remains, so this is not a sandbox. A dispatched role is a leaf: it must not dispatch further.',
  '',
  '**Agent Teams** (`spawn_teammate` plus the shared task board and mailbox) — use it when several members must be',
  'alive at once. Members inherit your tools, so a teammate may dispatch a role specialist for its own slice;',
  'the Lead still owns the final review, the tests, and the answer.',
  '',
  '**Agency experts** (`list_experts` / `summon_expert`) — when the work belongs to a domain outside these',
  'engineering roles.',
].join('\n')

/** `repo-mapper` -> `subagent_repo_mapper`, matching the tools the harness-teams preset used to expose. */
function roleToolName(slug) {
  return ROLE_TOOL_PREFIX + slug.replace(/-/g, '_')
}

/** Load only manifest-declared roles; an extra Markdown file cannot become a tool. */
function loadRoles(rolesDir) {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'harness.manifest.json'), 'utf8'))
  return manifest.assets.agents.map((asset) => {
    const slug = asset.runtimeName
    const raw = readFileSync(join(rolesDir, basename(asset.source)), 'utf8').replace(/^\uFEFF/, '')
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
    if (match === null) throw new Error(`role file "${slug}.md" has no YAML frontmatter`)
    const body = match[1].trim()
    if (body === '') throw new Error(`role file "${slug}.md" has an empty body`)
    const authority = /^##\s+Authority\s*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/m.exec(body)
    if (authority === null || authority[1].trim() === '') throw new Error(`role file "${slug}.md" has no Authority`)
    return {
      slug,
      tool: roleToolName(slug),
      summary: asset.description,
      body,
      readOnly: /read only/i.test(authority[1].trim().split('\n')[0]),
    }
  })
}

function roleDescription(role) {
  const head = `Dispatch the \`${role.slug}\` harness role specialist as a subagent and return its Output Packet.`
  const body = role.summary === '' ? '' : ` ${role.summary}`
  const tail = role.readOnly
    ? ' This role is dispatched without the `write` and `edit` tools and its read-only contract is binding; shell tools are still present, so do not treat the tool list as a sandbox.'
    : ''
  return `${head}${body}${tail}`
}

function textBlocks(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/** Validate profile-owned options before registering any effects. */
function resolveOptions(config) {
  const options = config ?? {}
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!object(options)) throw new Error('harness-roles config must be an object')
  const known = ['rolesDir', 'provider', 'maxDepth', 'agentOptions', 'readOnlyDeny', 'policy']
  for (const key of Object.keys(options)) {
    if (!known.includes(key)) throw new Error(`harness-roles: unknown config field "${key}"`)
  }
  const rolesDir = options.rolesDir === undefined ? DEFAULT_ROLES_DIR : options.rolesDir
  if (typeof rolesDir !== 'string' || !isAbsolute(rolesDir)) throw new Error('rolesDir must be an absolute directory path')
  const provider = options.provider === undefined ? DEFAULT_PROVIDER : options.provider
  if (typeof provider !== 'string' || provider.trim() === '') throw new Error('provider must be a non-empty string')
  const maxDepth = options.maxDepth === undefined ? DEFAULT_MAX_DEPTH : options.maxDepth
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new Error('maxDepth must be a positive safe integer')
  if (options.agentOptions !== undefined && options.agentOptions !== null && !object(options.agentOptions)) {
    throw new Error('agentOptions must be an object or null')
  }
  if (options.readOnlyDeny !== undefined && (!Array.isArray(options.readOnlyDeny)
    || options.readOnlyDeny.some((value) => typeof value !== 'string' || value.trim() === ''))) {
    throw new Error('readOnlyDeny must be an array of non-empty tool names')
  }
  if (options.policy !== undefined && typeof options.policy !== 'boolean') throw new Error('policy must be a boolean')
  return {
    rolesDir,
    provider: provider.trim(),
    maxDepth,
    agentOptions: options.agentOptions ?? undefined,
    readOnlyDeny: [...new Set([...DEFAULT_READ_ONLY_DENY, ...(options.readOnlyDeny ?? [])])],
    policy: options.policy !== false,
  }
}

/**
 * Names `tools.restrict()` rejected in the CHILD's scope. A child may only restrict names
 * it inherits (the global layer plus its ancestor chain), which is not the calling agent's
 * own visible set: a name this plugin can see is not necessarily restrictable one level
 * down, and a name the parent cannot see may still be inherited by the child.
 */
function rejectedRestrictNames(error) {
  const message = error instanceof Error ? error.message : String(error)
  const found = /names unknown global tool(?:s)? ((?:"[^"]+"(?:, )?)+);/.exec(message)
  if (found === null) return []
  return [...found[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
}

export function apply(ctx, config) {
  const options = resolveOptions(config)
  const { rolesDir, provider: providerName, maxDepth, agentOptions, readOnlyDeny } = options

  const roles = loadRoles(rolesDir)
  const roleToolNames = roles.map((role) => role.tool)
  for (const tool of roleToolNames) {
    if (ctx.tools.get(tool) !== undefined) throw new Error(`harness-roles: tool "${tool}" already exists; remove the old role integration`)
  }

  for (const role of roles) {
    ctx.tools.register({
      name: role.tool,
      description: roleDescription(role),
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Short label for this delegation, shown in the transcript.',
          },
          prompt: {
            type: 'string',
            description: 'The complete Input Packet: goal, context, paths or revision identity, constraints, and downstream consumer.',
          },
        },
        required: ['description', 'prompt'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { output: { type: 'string' } },
          required: ['output'],
        },
        render: (_args, value) => [{ type: 'text', text: String((value && value.output) || '') }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const parent = exec.agent
        if (parent === undefined) throw new Error(`tool "${role.tool}" requires a calling agent`)
        const provider = ctx.subagents.getProvider(providerName)
        if (provider === undefined) throw new Error(`subagent provider "${providerName}" is unavailable`)
        if (!provider.capabilities.persona) throw new Error(`subagent provider "${providerName}" does not support the \`persona\` capability`)
        if (!provider.capabilities.toolFilter) throw new Error(`subagent provider "${providerName}" does not support the \`toolFilter\` capability`)
        if (!provider.capabilities.depthLimit) throw new Error(`subagent provider "${providerName}" does not support the \`depthLimit\` capability`)

        const prompt = typeof args.prompt === 'string' ? args.prompt : ''
        if (prompt.trim() === '') throw new Error(`tool "${role.tool}" requires a non-empty prompt`)
        const label = typeof args.description === 'string' && args.description.trim() !== '' ? args.description.trim() : role.slug

        const deny = [...roleToolNames, ...DELEGATION_TOOLS]
        if (role.readOnly) deny.push(...readOnlyDeny)

        const request = {
          label,
          prompt: [{ type: 'text', text: prompt }],
          parent,
          persona: PERSONA_HEAD(role.slug) + role.body,
          ...(agentOptions === undefined ? {} : { agentOptions }),
          maxDepth,
          signal: exec.signal,
        }

        // The child's restrictable set is only known once it exists, so start, and on a
        // rejected name drop exactly that name and retry. A rejected start is rolled back
        // by the subagent runtime before it rejects, so no child is left behind.
        let run
        let pending = [...new Set(deny)]
        for (let attempt = 0; run === undefined; attempt += 1) {
          try {
            run = await ctx.subagents.start(providerName, { ...request, toolFilter: { deny: pending } })
          } catch (error) {
            const rejected = rejectedRestrictNames(error).filter((name) => pending.includes(name))
            if (rejected.length === 0 || attempt >= 4) throw error
            pending = pending.filter((name) => !rejected.includes(name))
            console.warn(
              `[harness-roles] ${role.tool}: dropped tool-filter names that are not restrictable in the child scope: ${rejected.join(', ')}`,
            )
          }
        }
        const [execution] = await Promise.allSettled([run.result.then((result) => {
          const text = textBlocks(result.output)
          if (result.stopReason !== 'completed') {
            throw new Error(`role "${role.slug}" did not complete (${String(result.stopReason)})${text === '' ? '' : `: ${text}`}`)
          }
          return { output: text }
        })])
        const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())])
        if (execution.status === 'rejected') {
          if (disposal.status === 'rejected') {
            throw new AggregateError([execution.reason, disposal.reason],
              `role "${role.slug}" failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`)
          }
          throw execution.reason
        }
        if (disposal.status === 'rejected') throw disposal.reason
        return execution.value
      },
    })
  }

  if (options.policy !== false) {
    ctx.systemPrompt.section({ name: 'harness-roles:dispatch', order: 116, text: POLICY_SECTION })
  }
}
