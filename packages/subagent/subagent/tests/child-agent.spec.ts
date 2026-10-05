import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { assertSingleDirectoryParent } from '../src/out-of-process.ts'
import { Context } from '@deepseek-ai/cordis'
import SandboxPolicyService, { setSessionDirectories } from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { appendDelegatedPolicyOverrides, captureDelegatedPolicyOverrides, resolveChildAgentOptions } from '../src/child-agent.ts'

function parentAgent(): Agent {
  const id = SessionId('parent')
  return {
    id,
    ctx: new Context(),
    options: {
      provider: 'parent-provider',
      model: 'parent-model',
      reasoningEffort: ReasoningEffortId('high'),
      maxTokens: 512,
    },
    session: Session.create(id),
  } as Agent
}

describe('child Agent options', () => {
  it('inherits the parent effort while the exact route is unchanged', () => {
    expect(resolveChildAgentOptions(parentAgent(), undefined, 1)).toEqual({
      provider: 'parent-provider',
      model: 'parent-model',
      reasoningEffort: 'high',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('clears an inherited effort when the child route changes', () => {
    expect(resolveChildAgentOptions(parentAgent(), { model: 'child-model' }, 1)).toEqual({
      provider: 'parent-provider',
      model: 'child-model',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('keeps an explicit child effort when the child route changes', () => {
    expect(resolveChildAgentOptions(parentAgent(), {
      provider: 'child-provider',
      model: 'child-model',
      reasoningEffort: ReasoningEffortId('max'),
    }, 1)).toEqual({
      provider: 'child-provider',
      model: 'child-model',
      reasoningEffort: 'max',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })

  it('inherits the latest logged request selection over creation-time values', () => {
    const parent = parentAgent()
    parent.session.append('request/header', {
      header: {
        config: {
          provider: 'current-provider',
          model: 'current-model',
          reasoningEffort: ReasoningEffortId('low'),
        },
      },
      reason: 'initial',
    })

    expect(resolveChildAgentOptions(parent, undefined, 1)).toEqual({
      provider: 'current-provider',
      model: 'current-model',
      reasoningEffort: 'low',
      maxTokens: 512,
      subagentDepth: 1,
    })
  })
})


it('internal child sessions inherit the captured directories without repeating a fork event', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService)
    const parent = { ...parentAgent(), ctx }
    setSessionDirectories(parent.session, ['/secondary'], ctx.sessionProjections)
    const overrides = captureDelegatedPolicyOverrides(parent)
    const child = Session.create(SessionId('fresh-child'))
    appendDelegatedPolicyOverrides(child, overrides, ctx.sessionProjections)
    expect(ctx.sandboxPolicy.directoriesOf(child)).toEqual(['/secondary'])
    const fork = Session.create(SessionId('fork-child'), parent.session.snapshotEvents())
    appendDelegatedPolicyOverrides(fork, overrides, ctx.sessionProjections)
    expect(fork.snapshotEvents().filter(event => event.type === 'sandbox/directories')).toHaveLength(1)
  } finally { await ctx.fiber.dispose() }
})


it('external runtimes reject a parent with captured additional directories', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService)
    const parent = { ...parentAgent(), ctx }
    expect(() => { assertSingleDirectoryParent(parent, ctx.sandboxPolicy) }).not.toThrow()
    setSessionDirectories(parent.session, ['/secondary'], ctx.sessionProjections)
    expect(() => { assertSingleDirectoryParent(parent, ctx.sandboxPolicy) }).toThrow('cannot inherit additional session directories')
  } finally { await ctx.fiber.dispose() }
})
