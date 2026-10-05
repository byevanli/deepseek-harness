// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { WorkspaceEditor } from '../src/client/WorkspaceEditor.tsx'
import type { DirectoryFlowOwnerProps } from '../src/client/contract/slots.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
const t = makeTranslate(zh, commonZh)
const editorCss = readFileSync(join(import.meta.dirname, '../src/client/WorkspaceEditor.module.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
const stored: WorkspaceView = {
  workspaceId: 'saved' as WorkspaceView['workspaceId'], path: '/primary', additionalDirectories: ['/secondary'],
  title: 'Saved', sessionIds: [], createdAt: '0', updatedAt: '0',
}
function mount(workspace?: WorkspaceView, onSave = vi.fn(async () => {})) {
  let owner!: DirectoryFlowOwnerProps
  const onClose = vi.fn()
  render(<WorkspaceEditor workspace={workspace} titles={[]} t={t} flowAvailable
    renderDirectoryFlow={(value) => { owner = value; return value.open ? <span data-testid="directory-flow" /> : null }}
    onSave={onSave} onClose={onClose} />)
  return { onSave, onClose, pick: async (path: string) => {
    fireEvent.click(screen.getByRole('button', { name: '添加文件夹' }))
    await act(async () => { owner.onPicked(path) })
  } }
}

describe('WorkspaceEditor directory drafts', () => {
  it('retains a filesystem root as its initial name and refuses removing its sole primary', async () => {
    const b = mount()
    await b.pick('/')
    expect(screen.getByLabelText<HTMLInputElement>('工作区名称').value).toBe('/')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '移除 /' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '创建工作区' }))
    await waitFor(() => { expect(b.onClose).toHaveBeenCalledOnce() })
    expect(b.onSave).toHaveBeenCalledExactlyOnceWith({ path: '/', title: '/', additionalDirectories: [] })
  })

  it('keeps the last primary directory and requires explicit replacement before removal', async () => {
    const b = mount(stored)
    expect(screen.getByText('目录变更仅用于新会话；已有会话保留原目录与访问范围')).toBeTruthy()
    const primaryRemove = screen.getByRole<HTMLButtonElement>('button', { name: '移除 /primary' })
    expect(primaryRemove.disabled).toBe(true)
    fireEvent.click(primaryRemove)
    expect(screen.getByText('/primary')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '设为主要 /secondary' }))
    fireEvent.click(screen.getByRole('button', { name: '移除 /primary' }))
    expect(screen.queryByText('/primary')).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '移除 /secondary' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => { expect(b.onClose).toHaveBeenCalledOnce() })
    expect(b.onSave).toHaveBeenCalledExactlyOnceWith({ path: '/secondary', title: 'Saved', additionalDirectories: [] })
    expect(stored.path).toBe('/primary')
    expect(stored.additionalDirectories).toEqual(['/secondary'])
  })

  it('saves multiple selected directories atomically on Enter and ignores composing input', async () => {
    const b = mount()
    await b.pick('/one')
    await b.pick('/two')
    const input = screen.getByLabelText('工作区名称')
    fireEvent.change(input, { target: { value: ' Named ' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(b.onSave).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(b.onClose).toHaveBeenCalledOnce() })
    expect(b.onSave).toHaveBeenCalledExactlyOnceWith({ path: '/one', title: 'Named', additionalDirectories: ['/two'] })
  })

  it('retains the complete draft on failure and allows cancelling without saving', async () => {
    const b = mount(stored, vi.fn(async () => { throw new Error('save failed') }))
    await b.pick('/third')
    fireEvent.change(screen.getByLabelText('工作区名称'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('save failed') })
    expect(screen.getByLabelText<HTMLInputElement>('工作区名称').value).toBe('Changed')
    expect(screen.getByText('/primary')).toBeTruthy()
    expect(screen.getByText('/secondary')).toBeTruthy()
    expect(screen.getByText('/third')).toBeTruthy()
    expect(b.onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(b.onClose).toHaveBeenCalledOnce()
    expect(b.onSave).toHaveBeenCalledTimes(1)
  })

  it('rejects duplicate directory selection while keeping the existing draft', async () => {
    const b = mount(stored)
    await b.pick('/secondary')
    expect(screen.getByRole('alert').textContent).toBe('此目录已添加')
    expect(screen.getAllByText('/secondary')).toHaveLength(1)
    expect(b.onSave).not.toHaveBeenCalled()
  })
})

describe('WorkspaceEditor layout', () => {
  it('offers one compact add action in the empty source-folder card', () => {
    mount()
    const dialog = screen.getByRole('dialog', { name: '创建工作区' })
    expect(within(dialog).getByRole('heading', { name: '创建工作区' })).toBeTruthy()
    expect(within(dialog).getByText('源文件夹')).toBeTruthy()
    expect(within(dialog).getByText('在此电脑上添加文件夹')).toBeTruthy()
    const add = within(dialog).getByRole('button', { name: '添加文件夹' })
    expect(add.textContent).toBe('添加')
    expect(within(dialog).queryByRole('list')).toBeNull()
    expect(screen.getByLabelText<HTMLInputElement>('工作区名称').placeholder).toBe('工作区名称')
  })

  it('names rows by folder, keeps full paths for same-named folders, and ends the card with an add row', async () => {
    const b = mount()
    await b.pick('/one/app')
    await b.pick('/two/app')
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map(row => within(row).getByText('app').textContent)).toEqual(['app', 'app'])
    expect(within(rows[0]!).getByText('/one/app')).toBeTruthy()
    expect(within(rows[1]!).getByText('/two/app')).toBeTruthy()
    expect(within(rows[1]!).getByText('app').parentElement?.tabIndex).toBe(0)
    expect(within(rows[0]!).getByText('主要')).toBeTruthy()
    expect(within(rows[0]!).queryByRole('button', { name: /^设为主要/ })).toBeNull()
    expect(within(rows[1]!).getByRole('button', { name: '设为主要 /two/app' })).toBeTruthy()
    const addRow = screen.getByRole('button', { name: '添加文件夹' })
    expect(addRow.textContent).toBe('添加文件夹')
    expect(addRow.closest('ul')).toBeNull()
    expect(addRow.parentElement).toBe(screen.getByRole('list').parentElement)
    expect(screen.getByRole('dialog').querySelector('button button')).toBeNull()
  })

  it('disables every draft control while a save is pending', async () => {
    let finish!: () => void
    const b = mount(stored, vi.fn(() => new Promise<void>((resolve) => { finish = resolve })))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    const dialog = screen.getByRole('dialog')
    for (const control of within(dialog).getAllByRole<HTMLButtonElement>('button')) expect(control.disabled).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>('工作区名称').disabled).toBe(true)
    await act(async () => { finish() })
    await waitFor(() => { expect(b.onClose).toHaveBeenCalledOnce() })
  })
})

describe('WorkspaceEditor.module.css', () => {
  const rule = (selector: string): string => {
    for (const [, selectors = '', body = ''] of editorCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selectors.split(',').map(value => value.trim()).includes(selector)) return body
    }
    return ''
  }

  it('sizes the dialog for desktop while fitting narrow windows', () => {
    expect(rule('.dialog.dialog')).toMatch(/width:\s*min\(560px,\s*100%\)/)
    expect(rule('.dialog.dialog')).toMatch(/max-height:\s*100%/)
    expect(rule('.body')).toMatch(/overflow-y:\s*auto/)
  })

  it('draws name focus only from real focus and keeps weights at or below 500', () => {
    expect(rule('.nameField')).not.toMatch(/state-business-primary/)
    expect(rule('.nameField:focus-within')).toMatch(/state-business-primary/)
    for (const [, weight] of editorCss.matchAll(/font-weight:\s*(\d+)/g)) expect(Number(weight)).toBeLessThanOrEqual(500)
  })

  it('reveals the make-primary action on row hover or keyboard focus', () => {
    const hover = /@media \(hover: hover\) \{([\s\S]*?)\n\}/.exec(editorCss)?.[1] ?? ''
    expect(hover).toMatch(/\.makePrimary[^{]*\{\s*opacity:\s*0/)
    expect(hover).toContain('.directoryRow:hover .makePrimary')
    expect(hover).toContain('.directoryRow:focus-within .makePrimary')
  })
})
