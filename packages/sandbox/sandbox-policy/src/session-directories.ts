/**
 * 会话附加目录的持久化初始化；目录配置通过日志恢复，工作目录仍由头部保存。
 * @module @deepseek-ai/dsh-sandbox-policy/session-directories
 */
import { isAbsolute } from 'node:path'
import type { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import type { Session } from '@deepseek-ai/dsh-session'

import type {} from './types.ts'

/**
 * 在未发布的会话创建窗口保存目录快照；空列表沿用单目录默认行为。
 * @param session - 尚未开始模型请求的会话。
 * @param directories - 工作目录之外的绝对目录，按原顺序保存。
 * @param projections - 会话投影注册表，用于核验初始化状态。
 * @throws 已初始化、已有请求或目录不是绝对路径时拒绝。
 */
export function setSessionDirectories(
  session: Session, directories: readonly string[], projections: SessionProjectionRegistry,
): void {
  if (directories.length === 0) return
  if (projections.stateOf(session, 'sandboxDirectories') !== null) throw new Error('session directories already initialized')
  if (session.requestHeader() !== undefined) throw new Error('session directories must be initialized before requests')
  if (directories.some(directory => !isAbsolute(directory))) throw new Error('session directories must be absolute paths')
  if (directories.length > 0) session.append('sandbox/directories', { additionalDirectories: [...directories] })
}
