/**
 * 客户端与宿主共享的目录日志和投影类型，不引入宿主服务。
 * @module @deepseek-ai/dsh-sandbox-policy/types
 */
import type {} from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session-projection/types'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * 会话创建时捕获的完整附加目录；恢复必须识别此事件，否则拒绝日志。
     * @param additionalDirectories - 绝对执行环境目录列表。
     */
    'sandbox/directories': { additionalDirectories: readonly string[] }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** 会话创建时捕获的附加目录，旧会话为 null。 */
    sandboxDirectories: readonly string[] | null
  }
  interface SessionProjectionMap {
    /** 会话创建时捕获的附加目录；旧会话返回空列表。 */
    sandboxDirectories: readonly string[]
  }
}
