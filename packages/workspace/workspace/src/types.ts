/**
 * Public type vocabulary of the workspace entity: the `WorkspaceId` brand and
 * the `Workspace` consumer interface. Types only — the `WorkspaceId` factory
 * lives in `index.ts` (this file carries no runtime code).
 * @module @deepseek-ai/dsh-workspace/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
export type WorkspaceId = Branded<'WorkspaceId'>

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No registration carries that Workspace identity. */
    'workspace/not-found': { readonly workspaceId: WorkspaceId }
  }
}

/**
 * Activity families a `workspace/session-activity` listener may report. This
 * package declares none: each provider merges its own key from a module both
 * its Host and Client faces import, so a consumer that renders the families
 * sees exactly the keys its program compiled and falls through to a generic
 * description for any other. The shipped providers merge `turn` (the Agent
 * registry), `job` (the job registry seam), `subagent` (the Subagent
 * runtime), and `schedule` (the Schedule plugin).
 */
export interface SessionActivityKindMap {}

/** One activity family key. */
export type SessionActivityKind = keyof SessionActivityKindMap

/** One active item of a family that has per-item identity. */
export interface SessionActivityItem {
  /** Family-specific identity: a session id, a job id, or a schedule id. */
  readonly id: string
  /** Display label when the family carries one (a job label, a subagent label). */
  readonly label?: string
}

/**
 * One reason a session counts as active for archive admission. Families with
 * per-item identity list their items so a caller can name what must stop.
 */
export interface SessionActivity {
  readonly kind: SessionActivityKind
  /** Active items of the family; absent for a family without per-item identity (`turn`). */
  readonly items?: readonly SessionActivityItem[]
}

/**
 * 一个具有稳定标识、主要目录、附加目录、名称与有序 Session 归属的 Workspace。
 * 目录变更或目录失效不会改变已有 Session 归属。
 */
export interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /** 明确的规范主要目录；仅显式配置更新时替换，目录失效不自动替换。 */
  readonly path: string

  /** 已保存的附加规范目录，不影响已关联 Session 的归属。 */
  readonly additionalDirectories: readonly string[]

  /** Display title. Defaults to the final path segment, or a filesystem root's own spelling; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /** 持久化的 Session 归属，新增时置前，活动或目录变更不重排。 */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * 关联一个已保存或正在运行的 Session，其他 Workspace 已占用时拒绝。
   * @param sessionId - 要关联的 Session。
   * @returns 持久化完成通知；已关联的请求不重复写入。
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * 移动已关联 Session，有锚点时插入其前，无锚点时移至末尾。
   * @param sessionId - 已关联 Session。
   * @param beforeSessionId - 已关联锚点；省略时追加。
   * @returns 持久化完成通知；未知 Session 或锚点拒绝，原位移动不写入。
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * 移除关联的 Session，未关联的标识不写入，不修改 Session 日志。
   * @param sessionId - 要移除的 Session。
   * @returns 持久化完成通知。
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}
