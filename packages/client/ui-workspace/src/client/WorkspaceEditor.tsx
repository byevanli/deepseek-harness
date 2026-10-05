/** 工作区目录草稿；只有保存成功后才发布配置。 */
import { useEffect, useRef, useState } from 'react'
import type { WorkspaceCreateRequest, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { Button, IconCloseFillRegular, IconFolderCloseRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspacePickFlowProps } from './WorkspacePicker.tsx'
import css from './WorkspacePicker.module.css'

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
  return <>
    <Modal open={!flowOpen} onClose={close} closeLabel={t('close')}
      title={t(workspace === undefined ? 'editor.create' : 'editor.edit')}
      footer={<>
        <Button variant="outline" disabled={saving} onClick={close}>{t('cancel')}</Button>
        <Button variant="primary" disabled={blocked} onClick={save}>{t(workspace === undefined ? 'editor.create' : 'editor.save')}</Button>
      </>}>
      <input className={css.editorInput} value={title} aria-label={t('field.workspaceName')} data-modal-autofocus
        disabled={saving} onChange={(event) => { setTitle(event.target.value); setError(null) }}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); save() } }} />
      <p className={css.editorLabel}>{t('editor.directories')}</p>
      <ul className={css.directories}>
        {directories.map(path => <li key={path} className={css.directoryRow}>
          <IconFolderCloseRegular size={16} />
          <span className={css.directoryPath}>{path}</span>
          {path === primary
            ? <span className={css.primary}>{t('editor.primary')}</span>
            : <Button variant="outline" disabled={saving} aria-label={t('editor.makePrimaryPath', { path })}
              onClick={() => { setPrimary(path) }}>{t('editor.makePrimary')}</Button>}
          <Button variant="outline" disabled={saving || path === primary} aria-label={t('editor.removePath', { path })}
            onClick={() => { setDirectories(paths => paths.filter(candidate => candidate !== path)); setError(null) }}>
            <IconCloseFillRegular size={16} />
          </Button>
        </li>)}
      </ul>
      <Button variant="outline" disabled={saving || !flowAvailable} onClick={() => { setError(null); setFlowOpen(true) }}>{t('editor.addFolder')}</Button>
      <p className={css.editorHint}>{t('editor.primaryHint')}</p>
      {workspace !== undefined && <p className={css.editorHint}>{t('editor.newChatsOnly')}</p>}
      {duplicateTitle && <div className={css.modalError} role="alert">{t('conflict.named', { name: title.trim() })}</div>}
      {error !== null && <div className={css.modalError} role="alert">{error}</div>}
    </Modal>
    {renderDirectoryFlow({
      open: flowOpen,
      busy: false,
      onPicked: (path) => {
        setFlowOpen(false)
        if (directories.includes(path)) { setError(t('editor.duplicateDirectory')); return }
        setDirectories(paths => [...paths, path])
        if (primary === '') setPrimary(path)
        if (title.trim() === '') setTitle(path.split(/[\\/]/).filter(Boolean).at(-1) ?? path)
      },
      onCancel: () => { setFlowOpen(false) },
      onError: (message) => { setFlowOpen(false); setError(message) },
    })}
  </>
}
