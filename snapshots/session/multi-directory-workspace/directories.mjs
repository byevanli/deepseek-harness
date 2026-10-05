/** 新会话的目录捕获，使用产品插件事件与持久化接口。 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { setSessionDirectories } from '@deepseek-ai/dsh-sandbox-policy'

export const inject = ['sandboxPolicy', 'sessionProjections']

/** @param ctx - 产品插件上下文。 */
export function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    const secondary = join(agent.session.header.cwd, 'secondary')
    mkdirSync(secondary, { recursive: true })
    setSessionDirectories(agent.session, [secondary], ctx.sessionProjections)
  })
}
