/**
 * Generates authentic-looking Commands v3 Java for a simulated command, so the code
 * shown to students always matches what the simulator executes.
 *
 * WPILib API used: Command.noRequirements, Command.requiring(...).executing,
 * Mechanism.run / runRepeatedly, .withPriority, .named, and Coroutine methods.
 * Mechanism-specific calls inside bodies (e.g. drive.arcade(...)) are illustrative.
 */
import type { CommandDef, CommandId, CoroutineStep, Scenario } from './types.ts'
import { CYCLE_SECONDS, HIGHEST_PRIORITY, LOWEST_PRIORITY } from './types.ts'

const INDENT = '  '

function priorityLiteral(p: number): string {
  if (p === LOWEST_PRIORITY) return 'Command.LOWEST_PRIORITY'
  if (p === HIGHEST_PRIORITY) return 'Command.HIGHEST_PRIORITY'
  return String(p)
}

function ms(cycles: number): string {
  return `Milliseconds.of(${Math.round(cycles * CYCLE_SECONDS * 1000)})`
}

export function factoryFor(cmd: CommandDef): string {
  return cmd.factory ?? `${camel(cmd.name)}()`
}

function camel(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('')
}

function stepLines(step: CoroutineStep, refs: (id: CommandId) => string): string[] {
  switch (step.op) {
    case 'log':
      return [`System.out.println(${JSON.stringify(step.text)});`]
    case 'yield':
      return ['coroutine.yield();']
    case 'work':
      return [
        `for (int i = 0; i < ${step.cycles}; i++) {`,
        `${INDENT}${step.java ?? `// ${step.label}`}`,
        `${INDENT}coroutine.yield();`,
        '}',
      ]
    case 'repeat':
      return [step.java ?? `// ${step.label}`]
    case 'wait':
      return [`coroutine.wait(${ms(step.cycles)});`]
    case 'waitUntil':
      return [`coroutine.waitUntil(${step.signal});`]
    case 'fork':
      return [`coroutine.fork(${step.commands.map(refs).join(', ')});`]
    case 'await':
      return [`coroutine.await(${refs(step.command)});`]
    case 'awaitAll':
      return [`coroutine.awaitAll(${step.commands.map(refs).join(', ')});`]
    case 'awaitAny':
      return [`coroutine.awaitAny(${step.commands.map(refs).join(', ')});`]
    case 'park':
      return ['coroutine.park();']
    case 'setSignal':
      return [`${step.signal} = ${step.value};`]
    case 'setCancelOnForkFailure':
      return [`coroutine.setCancelOnForkFailure(${step.value});`]
  }
}

function referencedChildren(cmd: CommandDef): CommandId[] {
  const out: CommandId[] = []
  for (const step of cmd.body) {
    if (step.op === 'fork' || step.op === 'awaitAll' || step.op === 'awaitAny') out.push(...step.commands)
    else if (step.op === 'await') out.push(step.command)
  }
  return out
}

/**
 * Java source for the command's factory method body (the `return ...;` expression),
 * e.g. `return drive.run(coroutine -> { ... }).named("Drive Forward");`
 */
export function commandToJava(cmd: CommandDef, scenario: Scenario, options: { asMethod?: boolean } = {}): string {
  const byId = new Map(scenario.commands.map((c) => [c.id, c]))
  const children = referencedChildren(cmd)
  const counts = new Map<CommandId, number>()
  for (const c of children) counts.set(c, (counts.get(c) ?? 0) + 1)
  const locals = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id)
  const localName = (id: CommandId) => camel(byId.get(id)?.name ?? id)
  const refs = (id: CommandId) => {
    if (locals.includes(id)) return localName(id)
    const child = byId.get(id)
    return child ? factoryFor(child) : id
  }

  const lines: string[] = []
  for (const id of locals) {
    const child = byId.get(id)
    if (child) lines.push(`Command ${localName(id)} = ${factoryFor(child)};`)
  }
  if (locals.length) lines.push('')

  const reqs = cmd.requirements
  let tail = ''
  if (cmd.priority !== undefined && cmd.priority !== 0) tail += `.withPriority(${priorityLiteral(cmd.priority)})`
  tail += `.named(${JSON.stringify(cmd.name)});`

  if (cmd.repeatedly) {
    const step = cmd.body[0]
    const action = step && step.op === 'repeat' ? (step.java ?? `/* ${step.label} */`).replace(/;$/, '') : ''
    const owner = reqs[0] ?? 'mechanism'
    lines.push(`return ${owner}.runRepeatedly(() -> ${action})${tail}`)
  } else {
    const opener =
      reqs.length === 0
        ? 'return Command.noRequirements(coroutine -> {'
        : reqs.length === 1
          ? `return ${reqs[0]}.run(coroutine -> {`
          : `return Command.requiring(${reqs.join(', ')}).executing(coroutine -> {`
    lines.push(opener)
    for (const step of cmd.body) for (const l of stepLines(step, refs)) lines.push(INDENT + l)
    lines.push(`})${tail}`)
  }

  if (!options.asMethod) return lines.join('\n')
  const sig = `public Command ${factoryFor(cmd).replace(/^[a-z]+\./, '').replace(/\(.*\)$/, '()')} {`
  return [sig, ...lines.map((l) => (l ? INDENT + l : l)), '}'].join('\n')
}
