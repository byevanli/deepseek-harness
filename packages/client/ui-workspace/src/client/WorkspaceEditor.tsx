/** 工作区目录草稿；只有保存成功后才发布配置。 */
import { useEffect, useRef, useState } from 'react'
import type { WorkspaceCreateRequest, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import {
  Button, IconCloseOutlineRegular, IconFolderCloseRegular, IconProjectAddOutlineRegular, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspacePickFlowProps } from './WorkspacePicker.tsx'
import css from './WorkspaceEditor.module.css'

/** 工作区编辑器的当前记录、目录选择能力及保存回调。 */
interface WorkspaceEditorProps {
  workspace?: WorkspaceView | undefined
  titles: readonly string[]
  t: WorkspacePickFlowProps['t']
  flowAvailable: boolean
  renderDirectoryFlow: WorkspacePickFlowProps['renderDirectoryFlow']
  onSave: (input: WorkspaceCreateRequest) => Promise<void>
  onClose: () => void
}

/** 路径的末级文件夹名；文件系统根目录没有末级名称时返回原路径。 */
const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

/**
 * 编辑名称与目录；移除主要目录前必须显式选择另一个主要目录。
 * @param props - 草稿初值和持久化操作。
 * @returns 编辑弹窗及目录选择界面。
 */
export function WorkspaceEditor({ workspace, titles, t, flowAvailable, renderDirectoryFlow, onSave, onClose }: WorkspaceEditorProps) {
  const [title, setTitle] = useState(workspace?.title ?? '')
  const [directories, setDirectories] = useState<readonly string[]>(
    workspace === undefined ? [] : [workspace.path, ...workspace.additionalDirectories],
  )
  const [primary, setPrimary] = useState(workspace?.path ?? '')
  const [flowOpen, setFlowOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const duplicateTitle = title.trim() !== workspace?.title && titles.includes(title.trim())
  const blocked = saving || flowOpen || primary === '' || title.trim() === '' || duplicateTitle
  const heading = t(workspace === undefined ? 'editor.create' : 'editor.edit')
  useEffect(() => {
    if (!flowAvailable) setFlowOpen(false)
  }, [flowAvailable])
  const close = () => { if (!savingRef.current && !flowOpen) onClose() }
  const save = () => {
    if (blocked || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    void onSave({ path: primary, title: title.trim(), additionalDirectories: directories.filter(path => path !== primary) })
      .then(onClose)
      .catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { savingRef.current = false; setSaving(false) })
  }
  const addDisabled = saving || !flowAvailable
  const openFlow = () => { setError(null); setFlowOpen(true) }
  return <>
    <Modal open={!flowOpen} onClose={close} title={heading} headless className={css.dialog as string}>
      <div className={css.header}>
        <h2 className={css.title}>{heading}</h2>
        <button type="button" className={css.close} aria-label={t('close')} disabled={saving} onClick={close}>
          <IconCloseOutlineRegular size={16} />
        </button>
      </div>
      <div className={css.body}>
        <div className={css.nameField}>
          <span className={css.nameIcon}><IconFolderCloseRegular size={16} /></span>
          <input className={css.nameInput} value={title} aria-label={t('field.workspaceName')} placeholder={t('field.workspaceName')}
            data-modal-autofocus disabled={saving} onChange={(event) => { setTitle(event.target.value); setError(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); save() } }} />
        </div>
        <p className={css.sectionLabel}>{t('editor.directories')}</p>
        {directories.length === 0
          ? <div className={css.empty}>
            <p className={css.emptyText}>{t('editor.emptyDirectories')}</p>
            <button type="button" className={css.addPill} aria-label={t('editor.addFolder')} disabled={addDisabled} onClick={openFlow}>
              <IconProjectAddOutlineRegular size={16} />
              {t('editor.add')}
            </button>
          </div>
          : <div className={css.card}>
            <ul className={css.directories}>
              {directories.map(path => <li key={path} className={css.directoryRow}>
                <span className={css.rowIcon}><IconFolderCloseRegular size={16} /></span>
                <Tooltip label={path} side="top" portal delayMs={300}>
                  <span className={css.directoryText} tabIndex={0}>
                    <span className={css.directoryName}>{folderName(path)}</span>
                    {/* 完整路径区分同名文件夹；根目录名称与路径相同时不重复显示。 */}
                    {folderName(path) !== path && <span className={css.directoryPath}>{path}</span>}
                  </span>
                </Tooltip>
                {path === primary
                  ? <span className={css.primaryBadge}>{t('editor.primary')}</span>
                  : <button type="button" className={css.makePrimary} disabled={saving}
                    aria-label={t('editor.makePrimaryPath', { path })} onClick={() => { setPrimary(path) }}>
                    {t('editor.makePrimary')}
                  </button>}
                <button type="button" className={css.remove} disabled={saving || path === primary}
                  aria-label={t('editor.removePath', { path })}
                  onClick={() => { setDirectories(paths => paths.filter(candidate => candidate !== path)); setError(null) }}>
                  <IconCloseOutlineRegular size={14} />
                </button>
              </li>)}
            </ul>
            <button type="button" className={css.addRow} disabled={addDisabled} onClick={openFlow}>
              <span className={css.rowIcon}><IconProjectAddOutlineRegular size={16} /></span>
              {t('editor.addFolder')}
            </button>
          </div>}
        <div className={css.notes}>
          <p>{t('editor.primaryHint')}</p>
          {workspace !== undefined && <p>{t('editor.newChatsOnly')}</p>}
        </div>
        {duplicateTitle && <div className={css.error} role="alert">{t('conflict.named', { name: title.trim() })}</div>}
        {error !== null && <div className={css.error} role="alert">{error}</div>}
      </div>
      <div className={css.footer}>
        <Button variant="ghost" className={css.cancel} disabled={saving} onClick={close}>{t('cancel')}</Button>
        <Button variant="primary" disabled={blocked} onClick={save}>{t(workspace === undefined ? 'editor.create' : 'editor.save')}</Button>
      </div>
    </Modal>
    {renderDirectoryFlow({
      open: flowOpen,
      busy: false,
      onPicked: (path) => {
        setFlowOpen(false)
        if (directories.includes(path)) { setError(t('editor.duplicateDirectory')); return }
        setDirectories(paths => [...paths, path])
        if (primary === '') setPrimary(path)
        if (title.trim() === '') setTitle(folderName(path))
      },
      onCancel: () => { setFlowOpen(false) },
      onError: (message) => { setFlowOpen(false); setError(message) },
    })}
  </>
}
