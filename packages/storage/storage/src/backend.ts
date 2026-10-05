/**
 * Backend-facing vocabulary of the storage hub: a backend owns one medium
 * (a file-tree root, a database file) and exposes operation groups over it.
 * This module defines the normative contract text for backend implementers; the shared
 * conformance suite in `tests/contract.ts` checks every rule.
 * @module @deepseek-ai/dsh-storage/src/backend
 */

/** Allowed format for unit and table names: safe as a file name and as a SQL identifier segment without escaping. */
export const UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/

/**
 * One registered backend. A backend owns exactly one medium and shares its
 * lifecycle across all facets; facets are optional members — a backend that
 * cannot serve a data kind simply omits it, and resolution fails loud instead.
 */
export interface StorageBackend {
  /** Key-value operations; absent when this backend cannot serve them. */
  readonly kv?: KvFacet

  /**
   * Drain in-flight writes across all open units and release the medium.
   * Idempotent; concurrent and repeated calls resolve once teardown finishes.
   * @returns resolution after the medium is released.
   */
  close(): Promise<void>
}

/** The key-value data shape: whole-unit snapshots plus per-record durable writes. */
export interface KvFacet {
  /**
   * 打开具名单元；缺失介质首次写入时物化，读取立即提供空数据。
   * 只接受当前或显式声明的旧版本，其余以 version-mismatch 拒绝；畸形介质拒绝。
   * 同名未关闭单元不能重复打开。
   * @param descriptor - 单元静态标识与记录配置。
   * @returns 已打开的单元。
   */
  open(descriptor: KvUnitDescriptor): Promise<KvUnit>
}

/** Static identity and shape of one KV unit, projected from its owner's spec. */
export interface KvUnitDescriptor {
  /** Unit name; must match {@link UNIT_NAME_RE}. Also the file-name / SQL-identifier segment. */
  readonly name: string
  /** Unit format version; a non-negative integer stamped on the medium at first materialization. */
  readonly version: number
  /** Table names; each must match {@link UNIT_NAME_RE}. */
  readonly tables: readonly string[]
  /** Whether this unit carries the global singleton slot. */
  readonly hasGlobal: boolean
  /**
   * Medium layout. `single` (the default) keeps the whole unit in one
   * document; `per-record` keeps each record in its own document, so a unit
   * whose records are large or sparse never rewrites the rest on one write,
   * and an unaccepted version stamp discards only that record instead of
   * rejecting the whole unit. Backends that only serve one layout accept the
   * other's units as foreign documents.
   */
  readonly layout?: 'single' | 'per-record'
  /**
   * 当前记录 schema 明确接受的旧版本；只有低于当前版本的列举值可读。
   * 单文档和 SQLite 在成功写入数据时原子盖当前版本，读取不升级介质。
   * per-record 保持逐文档兼容读取与当前版本写入。
   */
  readonly compatibleVersions?: readonly number[]
}

/**
 * One opened unit. Values are opaque JSON to this layer: no schema, no
 * events, no domain meaning. The unit does NOT serialize concurrent writes —
 * write ordering is the caller's responsibility (the domain layer runs one
 * write chain per unit); the unit only guarantees that each single call is
 * atomic on the medium and durable once resolved (a crash after resolution
 * followed by a re-open observes the write). Any call after {@link close}
 * rejects with `closed`.
 */
export interface KvUnit {
  /**
   * Read the full current snapshot.
   * @returns every table's records keyed by table name, plus the global
   * singleton (`null` when never written or not declared).
   */
  loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }>

  /**
   * Upsert one record durably. Overwrite semantics: an existing key is replaced.
   * @param table - Declared table name.
   * @param key - Record key. In the `per-record` layout a key becomes a path
   * segment and must match `[a-zA-Z0-9_-]+` (an unsafe key rejects); in the
   * `single` layout keys stay opaque.
   * @param value - Opaque JSON-serializable record.
   * @returns resolution after durability.
   */
  putRecord(table: string, key: string, value: unknown): Promise<void>

  /**
   * Delete one record durably. Idempotent: a missing key is a no-op.
   * @param table - Declared table name.
   * @param key - Record key.
   * @returns resolution after durability.
   */
  deleteRecord(table: string, key: string): Promise<void>

  /**
   * Move one record's stored document out of the unit's readable set,
   * preserving its bytes for inspection instead of deleting them. Backends
   * whose medium has no per-record document to move (the `single` layout, a
   * row store) omit this member, and the caller falls back to its
   * reject-loud path. Absent after the move: a later {@link loadAll} reads
   * the key as missing and a later {@link putRecord} recreates it fresh.
   * @param table - Declared table name.
   * @param key - Record key.
   * @returns the medium location the document was moved to (diagnostics).
   */
  backupRecord?(table: string, key: string): Promise<string>

  /**
   * Write the global singleton durably. Only valid when the descriptor
   * declared `hasGlobal`.
   * @param value - Opaque JSON-serializable value.
   * @returns resolution after durability.
   */
  setGlobal(value: unknown): Promise<void>

  /**
   * Drain this unit's in-flight writes and release it. Idempotent.
   * @returns resolution after the unit is released.
   */
  close(): Promise<void>
}
