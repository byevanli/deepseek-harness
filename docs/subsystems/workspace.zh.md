# 工作区

[English](workspace.md) | 中文

Workspace 保存稳定标识、显示标题、明确的主要目录、附加目录与有序 Session 归属。[工作区包](../../packages/workspace/workspace) 的 `ctx.workspaceRegistry` 通过[存储领域数据形式](storage.zh.md)保存这些记录。注册表不提供模型工具或提示词。`storageDomain` 与 `sessionPersistence` 是必需的启动依赖，因此不会把不可用的持久化误当作空历史；目录变更或缺失不会移除已有归属。

源码：[`packages/workspace/workspace/src/types.ts`](../../packages/workspace/workspace/src/types.ts)

## 标识

```ts type-equiv
/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
type WorkspaceId = Branded<'WorkspaceId'>
```

`WorkspaceId` 是[品牌化 id](core.zh.md#branded-ids)。`realpathNormalize` 将符号链接与相对路径片段解析为规范的绝对目录路径。主要目录在 Workspace 之间唯一，附加目录允许共享；同一 Workspace 内重复的规范目录会拒绝。

## 工作区实体

消费方只看到 `Workspace` 接口；实现保持包内私有。

```ts type-equiv
/**
 * 一个具有稳定标识、主要目录、附加目录、名称与有序 Session 归属的 Workspace。
 * 目录变更或目录失效不会改变已有 Session 归属。
 */
interface Workspace {
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
```

有序 `sessionIds` 记录决定归属，与当前目录配置或可用性无关。关联操作检查 Session 存在且没有其他 Workspace 占用，并与注册表变更串行执行。目录变更或缺失的 Session 头不会改变已有归属与手动顺序。有效变更更新时间戳 `updatedAt`，幂等操作不重复写入。

## 注册表：`ctx.workspaceRegistry`

`WorkspaceRegistry`（[签名](#ctxworkspaceregistry--workspaceregistry)）管理注册与解析。`create({ path, title?, additionalDirectories? })` 接受一个明确的主要目录和附加目录，也支持原有路径参数。新增目录必须存在且经过规范化。`update(id, { path, title, additionalDirectories })` 原子保存完整配置，未改变的已保存缺失目录可以保留。`get(id)` 与有序 `list()` 读取缓存，`resolveByPath(path)` 只查找主要目录。`delete(id)` 移除注册与归属，不触及文件或 Session 日志。创建与删除的 pending 标记维持中断写入恢复；无法解释的顺序与表记录不一致会拒绝。

新 Session 在执行前捕获所选 Workspace 的主要目录和附加目录；已有 Session 保留其不可变工作目录和捕获的访问目录。关联操作验证存在性与独占归属。首次启动只从持久化头部引导历史，按规范 cwd 分组一次；已初始化注册表不会重新分组。Workspace 领域版本 3 显式接受版本 2 记录并补充空附加目录列表，保留标识、时间戳、手动顺序、归档与置顶。

## 默认工作区初始化

控制器的 `initializeDefault` 不接受请求参数：它拥有固定目录名 `default-workspace`，解析 Documents 位置，并请求注册表执行一次初始化。注册表接收目录解析器，以所请求目录（而非规范路径）的最后一段作为初始标题，并将登记与持久化身份一起提交。语言不会传到 Host——浏览器消费方通过控制器的 `workspaceDisplayTitle` 为仍保留该自动标题的工作区加标签，因此只有屏幕上的名称跟随读者语言。[首次使用行为与配置](../../packages/api/workspace-controller/README.zh.md#first-use-workspace)说明复用和失败处理。

## 会话置顶

控制器的[传输类型](../../packages/api/workspace-controller/src/types.ts)定义了 `WorkspacePinSessionRequest` 和 `WorkspaceUnpinSessionRequest`，两者都携带一个 `sessionId`。两个操作都返回 `WorkspacePinValue`：完整的会话 id 数组 `pinnedSessionIds`，最近置顶的会话排在前面。置顶要求会话已知且未归档；对未置顶的 id 取消置顶会成功，且不改变集合。归档在同一次持久化写入中移除该会话的置顶，取消归档不会恢复置顶。

## 归档准入

归档是一个注册表全局的持久化集合，注册表拒绝把正在运行的工作藏在它后面。这条规则是本包声明并派发的两个宿主事件之上的能力接缝（[事件](#workspace-events)）：`workspace/session-activity`（waterfall）向已组合的提供方询问某会话还有什么在跑，`workspace/session-stop`（parallel）请它们停止这些工作。每个提供方像任何监听器一样在根上注册，因此本包不认识 agent、job 或 schedule 的词汇；各族是一个可合并扩展的 map 的键。

```ts type-equiv
/**
 * Activity families a `workspace/session-activity` listener may report. This
 * package declares none: each provider merges its own key from a module both
 * its Host and Client faces import, so a consumer that renders the families
 * sees exactly the keys its program compiled and falls through to a generic
 * description for any other. The shipped providers merge `turn` (the Agent
 * registry), `job` (the job registry seam), `subagent` (the Subagent
 * runtime), and `schedule` (the Schedule plugin).
 */
interface SessionActivityKindMap {}
```

`SessionActivityKind` 即 `keyof SessionActivityKindMap`，因此一个没有编译任何提供方的程序看不到任何键。随附的键放在各自 client 可导入的类型模块里：`turn` 在 Agent 注册表的 `types.ts`，`job` 在任务注册表接缝的 `view.ts`，`subagent` 在 Subagent runtime 的 `control-types.ts`，`schedule` 在 Schedule 插件的 `types.ts`；渲染各族的消费方为其分支导入这些模块，并为其他任何键保留一条通用文案。提供方通过把自己的 `SessionActivity` 条目前置到 `next()` 的结果来回答 waterfall；注册表最内层的回调返回空列表，因此没有提供方的组合可自由归档。

```ts type-equiv
/**
 * One reason a session counts as active for archive admission. Families with
 * per-item identity list their items so a caller can name what must stop.
 */
interface SessionActivity {
  readonly kind: SessionActivityKind
  /** Active items of the family; absent for a family without per-item identity (`turn`). */
  readonly items?: readonly SessionActivityItem[]
}
```

`SessionActivityItem` 携带各族自己的 `id`（会话、任务或提醒 id）和可选的展示 `label`。`archiveSession(sessionId)` 在存在性检查之后只询问 waterfall 一次，对非空答案以 `WorkspaceActiveSessionError`（`sessionId`、`activity`）拒绝且不写入；控制器把它映射为 `workspace/session-active` 错误，其 details 携带同样的两个字段。`archiveSession(sessionId, { stopActivity: true })`——`ArchiveSessionOptions` 的这个字段由传输请求以 `stopActivity` 暴露——跳过检查、先写入归档、再派发 `workspace/session-stop`；提供方抛错只记日志，归档保留，被停止的工作从不等待收敛。已归档的 id 既不询问也不停止。随附的提供方、它们停止什么，以及让已归档会话不跑模型步的 `agent/pre-step` 门禁，记录在[注册表包](../../packages/workspace/workspace/README.zh.md#api-behavior)；决策记录见 [archive-stops-running-work Agent Note](../../.agents/notes/implemented/feature/2026-09-21-archive-stops-running-session-work.zh.md)。

## 消费方

[`dsh-workspace-controller`](../../packages/api/workspace-controller) 经 `ctx.workspaceRegistry` 向 GUI 客户端提供工作区 CRUD，[`dsh-session-controller`](../../packages/api/session-controller) 执行上文「先建会话再 attach」的流程。[dsh-agent-instructions](../../packages/context/agent-instructions) 尽管名字如此，却**不是**消费方：它在 agent 自己的 cwd 下发现 AGENTS.md 风格的指令文件，从不触碰 `ctx.workspaceRegistry`——两者共用的这个词指的是用户的工作目录，而非本注册表的实体。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdirectorypicker--directorypicker-abstract-seam"></a>

### `ctx.directoryPicker` — `DirectoryPicker` (abstract seam)

Abstract directory-picking service. Subclass, implement `capability()`, and load the subclass as a plugin — it registers as `ctx.directoryPicker` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior). The capability object must be stable for the service lifetime: consumers may capture it across calls.

```ts cordis-catalog
/**
 * The backend's interaction capability.
 * @returns the discriminated capability consumers switch on.
 */
abstract capability(): DirectoryPickerCapability
```

Source: [`packages/host/directory-picker/src/index.ts`](../../packages/host/directory-picker/src/index.ts)

<a id="ctxdirectorypickercontroller--directorypickercontroller"></a>

### `ctx.directoryPickerController` — `DirectoryPickerController`

Host service backing the generated `ctx.remote.directoryPicker` namespace. The seam it exports is abstract and therefore never a Loader entry of its own, so this controller carries the wire verbs: one composed backend serves either the native chooser or the browse primitives, and a verb the composition cannot serve is refused rather than approximated.

```ts cordis-catalog
/**
 * Open the host's OS chooser for a Remote caller.
 * @param signal - caller lifetime; abort terminates the chooser.
 * @returns the chosen absolute path, or null when the operator cancels.
 */
@Remote('pick') async pick(signal: AbortSignal): Promise<string | null>

/**
 * List one directory level for a Remote caller's in-app browser.
 * @param path - absolute directory to list; absent lists the home directory.
 * @param signal - caller lifetime; abort stops the backend's scan instead of
 *   letting it outlive a disconnected caller.
 * @returns the level's listing with its ancestry.
 */
@Remote('list') async list(path: string | undefined, signal: AbortSignal): Promise<DirectoryListing>

/**
 * Create one child directory for a Remote caller's in-app browser.
 * @param path - absolute existing parent directory.
 * @param name - single non-blank path segment.
 * @returns the created directory's absolute path.
 */
@Remote('createDirectory') async createDirectory(path: string, name: string): Promise<string>
```

Source: [`packages/api/workspace-controller/src/directory-picker.ts`](../../packages/api/workspace-controller/src/directory-picker.ts)

<a id="ctxterminalcontroller--terminalcontroller"></a>

### `ctx.terminalController` — `TerminalController`

Typed Remote control of transient Session-owned terminal processes.

```ts cordis-catalog
/**
 * Read the Session working directory and terminal limits without resolving a shell.
 * @param agent - Session owner supplied by the Gateway.
 * @param signal - request cancellation.
 * @returns the Session workspace directory and terminal limits.
 */
@Remote environment(agent: Agent, signal: AbortSignal): TerminalEnvironment

/**
 * Discover installed shells in the Session's execution environment.
 * @param agent - Session owner supplied by the Gateway.
 * @param signal - request cancellation.
 * @returns verified profiles, with the configured or system default first.
 */
@Remote shells(agent: Agent, signal: AbortSignal): Promise<TerminalShell[]>

/**
 * List retained terminals without resolving or activating an Agent.
 * @param sessionId - displayed Session identity, including offline history.
 * @returns terminals retained for this Host lifetime.
 */
@Remote list(sessionId: SessionId): WebTerminalInfo[]

/**
 * Allocate a user shell once for a caller-generated identity, without Agent sandbox or approval restrictions.
 * @param agent - Session owner supplied by the Gateway.
 * @param request - initial dimensions and idempotency identity.
 * @param signal - allocation cancellation; committed terminals survive disconnection.
 * @returns the existing or newly committed terminal.
 */
@Remote async create(agent: Agent, request: TerminalCreateRequest, signal: AbortSignal): Promise<WebTerminalInfo>

/**
 * Retain an existing terminal for a window without activating its Agent or taking input control.
 * @param sessionId - owning Session identity, including an inactive saved layout.
 * @param id - retained Host terminal identity.
 * @param signal - physical Remote stream cancellation.
 * @returns a hold acknowledgement followed by an open lifetime stream.
 */
@Remote({ mode: 'stream' }) retain(sessionId: SessionId, id: WebTerminalId, signal: AbortSignal): AsyncIterable<TerminalRetentionFrame>

/**
 * Attach to a terminal without binding its process lifetime to the transport.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - new exclusive input attachment.
 * @param signal - physical stream cancellation.
 * @returns screen recovery followed by output and metadata changes.
 */
@Remote({ mode: 'stream' }) follow(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, signal: AbortSignal): AsyncIterable<TerminalFrame>

/**
 * Deliver raw input, including Tab completion and control characters.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - current writable attachment.
 * @param data - input bytes represented as UTF-8 text.
 * @returns after provider input acceptance.
 */
@Remote async write(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, data: string): Promise<void>

/**
 * Update the dimensions of the PTY and recovery screen.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - current writable attachment.
 * @param cols - column count.
 * @param rows - row count.
 * @returns after the resize completes.
 */
@Remote async resize(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, cols: number, rows: number): Promise<void>

/**
 * Rename a terminal without changing its shell.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param title - nonempty display title, at most 120 characters.
 */
@Remote rename(agent: Agent, id: WebTerminalId, title: string): void

/**
 * Close an identity to future creation and kill its process range; repeated closes succeed.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @returns after provider cleanup succeeds. A failure retains the terminal for retry.
 */
@Remote async close(agent: Agent, id: WebTerminalId): Promise<void>
```

Types: [Agent](core.zh.md) · [SessionId](core.zh.md)

Source: [`packages/api/terminal-controller/src/index.ts`](../../packages/api/terminal-controller/src/index.ts)

<a id="ctxworkspacecontroller--workspacecontroller"></a>

### `ctx.workspaceController` — `WorkspaceController`

Host service backing the generated `ctx.remote.workspace` namespace.

```ts cordis-catalog
/**
 * Create or idempotently resolve one Workspace over an existing directory.
 * @param request - directory path to register.
 * @returns the Workspace and whether this call created it.
 */
@Remote('create') create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue>

/**
 * 一次保存完整 Workspace 配置。
 * @param request - 标识、名称与完整目录选择。
 * @returns 更新后的完整投影。
 */
@Remote('update') update(request: WorkspaceUpdateRequest): Promise<WorkspaceValue>

/**
 * Initialize or reuse the default Workspace during first-use startup. The
 * directory name is fixed, so the Host never renames or relocates an
 * existing default; its initial title is that same name, which browser
 * consumers label in the reader's language.
 * @param signal - caller lifetime; cancels native directory lookup.
 * @returns the durable Workspace, or undefined when first-use initialization is ineligible; creates no Session or message.
 */
@Remote('initializeDefault') async initializeDefault(signal: AbortSignal): Promise<WorkspaceValue | undefined>

/**
 * Rename one Workspace to a unique non-blank title.
 * @param request - Workspace identity and proposed title.
 * @returns the updated Workspace projection.
 */
@Remote('rename') rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue>

/**
 * Remove one Workspace registration while retaining files and Sessions.
 * @param request - Workspace identity to remove.
 * @returns deletion confirmation.
 */
@Remote('delete') delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue>

/**
 * Move one Workspace within the registry display order.
 * @param request - moved Workspace and optional anchor.
 * @returns the complete resulting Workspace order.
 */
@Remote('insertBefore') insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue>

/**
 * Move one accounted Session within a Workspace.
 * @param request - Workspace, Session, and optional anchor identities.
 * @returns the updated Workspace projection.
 */
@Remote('insertSessionBefore') insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue>

/**
 * Hide one known Session from Workspace grouping surfaces.
 * @param request - Session identity to archive.
 * @returns the complete resulting archive set.
 */
@Remote('archiveSession') archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Restore one archived Session to Workspace grouping surfaces.
 * @param request - Session identity to unarchive.
 * @returns the complete resulting archive set.
 */
@Remote('unarchiveSession') unarchiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Surface one known unarchived Session ahead of unpinned Sessions.
 * @param request - Session identity to pin.
 * @returns the complete resulting pin set, most recently pinned first.
 */
@Remote('pinSession') pinSession(request: WorkspacePinSessionRequest): Promise<WorkspacePinValue>

/**
 * Remove one Session's pin without changing its saved Session order.
 * @param request - Session identity to unpin.
 * @returns the complete resulting pin set, most recently pinned first.
 */
@Remote('unpinSession') unpinSession(request: WorkspaceUnpinSessionRequest): Promise<WorkspacePinValue>

/**
 * Stream a complete Workspace baseline followed by ordered increments.
 * @param signal - generation cancellation.
 * @returns baseline followed by ordered Workspace increments.
 */
@Remote({ mode: 'stream' }) follow(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame>
```

Source: [`packages/api/workspace-controller/src/index.ts`](../../packages/api/workspace-controller/src/index.ts)

<a id="ctxworkspacefiles--workspacefiles"></a>

### `ctx.workspaceFiles` — `WorkspaceFiles`

Host Remote file reads and workspace directory observations over the composed filesystem.

```ts cordis-catalog
/**
 * Read one page of lines from a UTF-8 file readable by the filesystem backend.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param range - the line window; omitted fields take the page defaults.
 * @param signal - caller cancellation.
 * @returns the page, the file's version at the stat before it, and whether it reaches the last line.
 */
@Remote async read( workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceFileRange, signal: AbortSignal, ): Promise<WorkspaceFileText>

/**
 * Read a complete regular file or one byte range without text decoding.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - target path, absolute or workspace-relative; relative to the base file's directory when provided.
 * @param options - optional base file and range; without a range the complete-file cap applies.
 * @param signal - caller cancellation.
 * @returns native bytes with the file's version and size at the preceding stat, byte offset, and EOF marker.
 */
@Remote async readBytes( workspaceFileScope: WorkspaceFileScope, path: string, options: WorkspaceByteReadOptions, signal: AbortSignal, ): Promise<WorkspaceFileBytes>

/**
 * Report one regular file's identity, version, and size without its content.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param signal - caller cancellation.
 * @returns the file's absolute path, current version, and byte size.
 */
@Remote async stat(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileStat>

/**
 * List the direct children of one directory inside the Session's workspace.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - workspace path, absolute or relative to the workspace root.
 * @param signal - caller cancellation.
 * @returns the directory's children in the backend's stable name order, bounded by the entry cap.
 */
@Remote async list(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceDirectoryListing>

/**
 * Watch one file or a directory's direct entries in the Session's filesystem.
 * Files use the backend's read authority; directories remain workspace-scoped.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - target path; the Host determines its type and confines directories to the workspace.
 * @param signal - generation cancellation.
 * @returns `ready` once the target watch is active, then current metadata for queued and live invalidations.
 * @throws RemoteError when watching is unavailable or a directory is outside the workspace.
 */
@Remote({ mode: 'stream' }) changes(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): AsyncIterable<WorkspaceFileWatchFrame>
```

Source: [`packages/api/workspace-files/src/index.ts`](../../packages/api/workspace-files/src/index.ts)

<a id="ctxworkspaceregistry--workspaceregistry"></a>

### `ctx.workspaceRegistry` — `WorkspaceRegistry`

Durable workspace registry. Startup waits for `sessionPersistence`, builds one canonical-cwd header index, and completes the one-time history bootstrap before the service becomes active. The persistence dependency is mandatory so an unavailable peer can never be mistaken for an empty history and commit the initialized marker.

```ts cordis-catalog
/**
 * 注册已存在的主要目录与附加目录；新记录置于注册表显示顺序首位。
 * 旧路径调用幂等复用，显式配置与已有主要目录配置不同时拒绝。
 * @param input - 主要目录或包含名称与附加目录的配置。
 * @param title - 旧路径调用创建时使用的名称。
 * @returns 新建或既有 Workspace。
 */
async create( input: string | { path: string; title?: string; additionalDirectories?: readonly string[] }, title?: string, ): Promise<Workspace>

/**
 * 一次保存主要目录、名称与附加目录；既有缺失目录可以原样保留。
 * @param id - Workspace 标识。
 * @param configuration - 完整配置，主要目录必须明确提供。
 * @returns 更新后的 Workspace；不存在的标识拒绝。
 */
update(id: WorkspaceId, configuration: { path: string; title: string; additionalDirectories: readonly string[] }): Promise<Workspace>

/**
 * Initialize the default Workspace only while both the registry and Session
 * history are empty. Repeated requests reuse its durable identity; deleting
 * that registration permanently disables automatic creation.
 * @param resolveDirectory - resolve the absolute directory; called only for
 * eligible creation, inside the registry mutation queue. Missing directories
 * are created recursively before registration, and the initial title is the
 * requested directory's own final segment — not the canonical one, so a
 * symlink at that path does not retitle the Workspace after its target.
 * After resolution, caller cancellation does not roll back creation or registration.
 * @returns the initialized Workspace, or undefined when automatic creation is ineligible.
 */
initializeDefault(resolveDirectory: () => Promise<string>): Promise<Workspace | undefined>

/**
 * Look up a workspace by id.
 * @param id - Workspace id.
 * @returns the workspace, or `undefined` when unknown.
 */
get(id: WorkspaceId): Workspace | undefined

/**
 * 按持久化注册表顺序返回 Workspace，保留 Session 账本，不读取持久层。
 * @returns 独立的有序实体数组。
 */
list(): Workspace[]

/**
 * Delete one workspace registration while retaining its directory and every
 * session log. The durable order is updated before the table deletion; a
 * failed table write restores the prior order and keeps the entity
 * published. Unknown ids are an idempotent no-op for domain callers.
 * @param id - Workspace registration to remove.
 * @returns `true` when a record was deleted, `false` when it was unknown.
 */
delete(id: WorkspaceId): Promise<boolean>

/**
 * Move one workspace within the durable display order, DOM-insertBefore-like.
 * With an anchor it lands before that workspace; without one it appends.
 * @param id - Workspace to move.
 * @param beforeId - Workspace anchor; omitted appends.
 * @returns the complete committed workspace order.
 */
insertBefore(id: WorkspaceId, beforeId?: WorkspaceId): Promise<readonly WorkspaceId[]>

/**
 * Archive one session durably. The session must exist (live or in session
 * persistence); its workspace accounting — or lack of one — is irrelevant.
 * Without `stopActivity` the session must also be inactive: the
 * `workspace/session-activity` waterfall is asked once, and any reported
 * activity rejects with {@link WorkspaceActiveSessionError} before anything
 * is written. With `stopActivity` the archive is written without an
 * activity check, and the `workspace/session-stop` providers are then asked
 * to stop the session's work: the durable archive set is what a provider's
 * `agent/pre-step` gate reads, so every wake the stops induce is already
 * blocked. Archiving drops the session's pin in the same durable write
 * (pinning and archival are mutually exclusive). An already archived id
 * resolves without writing, asking, or stopping.
 * @param sessionId - The session to archive.
 * @param options - Whether running work is stopped instead of refusing.
 * @returns resolution after durability and, with `stopActivity`, after every stop request was issued.
 */
archiveSession(sessionId: SessionId, options: ArchiveSessionOptions = {}): Promise<void>

/**
 * Unarchive one session durably by dropping it from the registry-global
 * archive set; the accounting slot was never touched, so the session
 * returns to its recorded position. Unarchiving runs no session-existence
 * check because removing an id cannot introduce an unknown one, so an
 * entry whose session is gone still resolves. An id that is not archived
 * resolves without writing.
 * @param sessionId - The session to unarchive.
 * @returns resolution after durability.
 */
unarchiveSession(sessionId: SessionId): Promise<void>

/**
 * Pin one session durably, prepending it to the registry-global pin set.
 * The session must exist (live or in session persistence) and must not be
 * archived. An already pinned id resolves without writing or reordering.
 * @param sessionId - The session to pin.
 * @returns resolution after durability.
 */
pinSession(sessionId: SessionId): Promise<void>

/**
 * Unpin one session durably by dropping it from the registry-global pin
 * set. Unpinning runs no session-existence check because removing an id
 * cannot introduce an unknown one, so an entry whose session is gone still
 * resolves. An id that is not pinned resolves without writing.
 * @param sessionId - The session to unpin.
 * @returns resolution after durability.
 */
unpinSession(sessionId: SessionId): Promise<void>

/**
 * Resolve by canonical directory path without creating or mutating a
 * workspace. A missing path rejects during `realpath`; an existing unowned
 * directory returns `undefined`.
 * @param path - Existing directory path in a fully qualified spelling.
 * @returns the workspace owning the canonical path, when one exists.
 */
async resolveByPath(path: string): Promise<Workspace | undefined>
```

Types: [SessionId](core.zh.md)

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)

<a id="workspace-events"></a>

### `workspace/*` events

<a id="workspacesession-activity--waterfall"></a>

#### `workspace/session-activity` — waterfall

Ask the composed providers what still runs for a session before it is archived. A listener prepends its own SessionActivity entries to the result of `next()`; the registry's innermost callback returns an empty list, so a composition without providers archives freely. Any non-empty result refuses the archive without a write.

```ts cordis-catalog
/**
 * Ask the composed providers what still runs for a session before it is
 * archived. A listener prepends its own {@link SessionActivity} entries to
 * the result of `next()`; the registry's innermost callback returns an
 * empty list, so a composition without providers archives freely. Any
 * non-empty result refuses the archive without a write.
 * @param request - the session about to be archived.
 * @param next - delegate to the remaining providers.
 * @mode waterfall
 */
'workspace/session-activity'( request: SessionActivityRequest, next: () => Promise<readonly SessionActivity[]>, ): Promise<readonly SessionActivity[]>
```

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)

<a id="workspacesession-stop--parallel"></a>

#### `workspace/session-stop` — parallel

Stop a session's running work because the caller archived it with `stopActivity`; the archive set is durable when this dispatches. Each provider stops its own families — cancelling a turn, its subagent descendants, owned jobs, or active schedules — through the same cancel paths the user's own stop actions use, so the session log ends every open turn regularly and a later unarchive can continue the conversation. Listeners issue their stop requests without waiting for running work to settle; a listener may await its own durability barrier. A rejection is logged by the registry and does not undo the archive.

```ts cordis-catalog
/**
 * Stop a session's running work because the caller archived it with
 * `stopActivity`; the archive set is durable when this dispatches. Each
 * provider stops its own families — cancelling a turn, its subagent
 * descendants, owned jobs, or active schedules — through the same cancel
 * paths the user's own stop actions use, so the session log ends every
 * open turn regularly and a later unarchive can continue the
 * conversation. Listeners issue their stop requests without waiting for
 * running work to settle; a listener may await its own durability
 * barrier. A rejection is logged by the registry and does not undo the
 * archive.
 * @param request - the session being archived.
 * @mode parallel
 */
'workspace/session-stop'(request: SessionActivityRequest): Promise<void> | void
```

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)
<!-- END GENERATED cordis-surface -->
