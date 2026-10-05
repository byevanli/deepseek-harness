// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  WorkspaceId, WorkspaceSnapshot, WorkspaceView,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { DirectoryFlowOwnerProps, WorkspacePickerProps } from '../src/client/contract/slots.ts'
import { WorkspacePicker } from '../src/client/WorkspacePicker.tsx'
import { zh } from '../src/client/locales.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

// The seat's key domain is workspace ∪ common; the stub mirrors the real
// lookup chain (namespace, then common vocabulary, then the key).
const t: WorkspacePickerProps['t'] = makeTranslate(zh, commonZh)

const wid = (id: string) => id as WorkspaceId
function workspace(id: string, title = id): WorkspaceView {
  return {
    workspaceId: wid(id), additionalDirectories: [], path: `/projects/${id}`, title, sessionIds: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}
const sessions: SessionListState = {
  ids: [], byId: {}, phase: 'ready', projectionsBySession: {},
}
const noPendingInteraction: SessionStatusSnapshot = new Map()
const workspaceState = (items: readonly WorkspaceView[]): WorkspaceSnapshot => ({
  items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})
function anchor(): { current: HTMLElement } {
  const element = document.createElement('button')
  element.getBoundingClientRect = () => ({
    top: 10, left: 20, width: 30, height: 40, right: 50, bottom: 50,
    x: 20, y: 10, toJSON: () => ({}),
  })
  return { current: element }
}

/**
 * Probe occupant of the directory-flow hole: records the latest owner
 * conversation so tests drive onPicked/onCancel/onError like a composed flow
 * package would, and renders a marker element while the flow is open.
 */
function flowProbe() {
  const probe: { owner: DirectoryFlowOwnerProps | undefined } = { owner: undefined }
  const renderSlot = ((_name: string, owner: DirectoryFlowOwnerProps) => {
    probe.owner = owner
    return owner.open ? <div data-testid="directory-flow" data-busy={owner.busy} /> : null
  }) as never
  return { probe, renderSlot }
}

/** Manual occupancy source bound like the renderer would: flip() drives the hook like a real registration change. */
function occupancySource(initial = true) {
  let occupied = initial
  const listeners = new Set<() => void>()
  const useDirectoryFlow = bindSnapshotSelector({
    getSnapshot: () => occupied,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
  return {
    useDirectoryFlow,
    flip: (next: boolean) => {
      occupied = next
      for (const listener of [...listeners]) listener()
    },
  }
}

function mount(
  items: readonly WorkspaceView[] = [workspace('alpha', 'Alpha')],
  createWorkspace = vi.fn(),
  occupancy = occupancySource(),
) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  const anchorRef = anchor()
  const { probe, renderSlot } = flowProbe()
  const renderPicker = (nextItems: readonly WorkspaceView[]) => (
    <WorkspacePicker
      open
      anchorRef={anchorRef}
      useSessions={hook(sessions)}
      useSessionStatus={hook(noPendingInteraction)}
      useSessionRetainInfo={() => undefined}
      usePanelInfo={usePanelInfo} useResource={useResource}
      useWorkspaces={hook(workspaceState(nextItems))}
      onPick={onPick}
      onClose={onClose}
      createWorkspace={createWorkspace}
      useDirectoryFlow={occupancy.useDirectoryFlow}
      renderSlot={renderSlot}
      t={t}
    />
  )
  const view = render(
    renderPicker(items),
  )
  return {
    view, onPick, onClose, createWorkspace, probe, occupancy,
    rerenderItems: (nextItems: readonly WorkspaceView[]) => { view.rerender(renderPicker(nextItems)) },
  }
}

function chooseAdd(selectDirectory = true): void {
  fireEvent.click(screen.getByRole('menuitem', { name: '添加工作区…' }))
  if (selectDirectory) fireEvent.click(screen.getByRole('button', { name: '添加文件夹' }))
}

describe('WorkspacePicker', () => {
  it('lists same-title Workspaces separately and forwards the selected id', () => {
    const b = mount([workspace('alpha', 'Shared'), workspace('beta', 'Shared')])
    const entries = screen.getAllByRole('menuitem', { name: 'Shared' })
    expect(entries).toHaveLength(2)
    fireEvent.click(entries[1]!)
    expect(b.onPick).toHaveBeenCalledWith(wid('beta'))
  })

  it('saves a picked directory explicitly before selecting the returned Workspace', async () => {
    const created = { ...workspace('adopted'), path: '/tmp/project', title: 'project' }
    const b = mount([workspace('alpha', 'Alpha')], vi.fn(async () => created))
    chooseAdd()
    expect(screen.getByTestId('directory-flow')).toBeTruthy()
    await act(async () => { b.probe.owner!.onPicked('/tmp/project') })
    expect(b.createWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '创建工作区' }))
    await waitFor(() => { expect(b.onPick).toHaveBeenCalledWith(created.workspaceId) })
    expect(b.createWorkspace).toHaveBeenCalledWith({ path: '/tmp/project', title: 'project', additionalDirectories: [] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the draft directly when creation is the only entry', () => {
    const b = mount([])
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('dialog', { name: '创建工作区' })).toBeTruthy()
    expect(b.createWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '添加文件夹' }))
    expect(screen.getByTestId('directory-flow')).toBeTruthy()
  })

  it('returns to the unchanged draft when directory selection is cancelled', () => {
    const b = mount()
    chooseAdd()
    act(() => { b.probe.owner!.onCancel() })
    expect(screen.queryByTestId('directory-flow')).toBeNull()
    expect(screen.getByRole('dialog', { name: '创建工作区' })).toBeTruthy()
    expect(b.createWorkspace).not.toHaveBeenCalled()
    expect(b.onPick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('retains the directory draft after a non-Error save failure', async () => {
    const b = mount([workspace('alpha', 'Alpha')], vi.fn(async () => { throw 'permission denied' }))
    chooseAdd()
    await act(async () => { b.probe.owner!.onPicked('/one/project') })
    fireEvent.click(screen.getByRole('button', { name: '创建工作区' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('permission denied') })
    expect(screen.getByText('/one/project')).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('工作区名称').value).toBe('project')
    expect(b.onPick).not.toHaveBeenCalled()
  })

  it('blocks competing actions throughout directory selection and the pending save', async () => {
    let resolve!: (workspace: WorkspaceView) => void
    const pending = new Promise<WorkspaceView>((settle) => { resolve = settle })
    const b = mount([workspace('alpha', 'Alpha')], vi.fn(() => pending))
    chooseAdd()
    expect(screen.getByRole<HTMLButtonElement>('menuitem', { name: 'Alpha' }).disabled).toBe(true)
    await act(async () => { b.probe.owner!.onPicked('/tmp/project') })
    fireEvent.click(screen.getByRole('button', { name: '创建工作区' }))
    expect(screen.getByLabelText<HTMLInputElement>('工作区名称').disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '取消' }).disabled).toBe(true)
    fireEvent.keyDown(screen.getByLabelText('工作区名称'), { key: 'Enter' })
    expect(b.createWorkspace).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(workspace('adopted')); await pending })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the flow-reported failure in the folder-error surface', () => {
    const b = mount([workspace('alpha', 'Alpha')])
    chooseAdd()
    act(() => { b.probe.owner!.onError('no chooser installed') })
    expect(screen.getByRole('alert').textContent).toBe('no chooser installed')
    expect(screen.queryByTestId('directory-flow')).toBeNull()
    expect(b.createWorkspace).not.toHaveBeenCalled()
  })

  it('closes the folder-error surface when the user cancels', () => {
    const b = mount([workspace('alpha', 'Alpha')])
    chooseAdd()
    act(() => { b.probe.owner!.onError('no chooser installed') })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('waits to show its menu until an optional anchor is available', () => {
    const { renderSlot } = flowProbe()
    render(
      <WorkspacePicker
        open useSessions={hook(sessions)} useWorkspaces={hook(workspaceState([workspace('alpha', 'Alpha')]))}
        useSessionStatus={hook(noPendingInteraction)}
        useSessionRetainInfo={() => undefined}
        usePanelInfo={usePanelInfo} useResource={useResource}
        onPick={vi.fn()} onClose={vi.fn()} createWorkspace={vi.fn()}
        useDirectoryFlow={occupancySource().useDirectoryFlow} renderSlot={renderSlot} t={t}
      />,
    )
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keeps the menu up while the list baseline is still in flight', () => {
    const state: WorkspaceSnapshot = {
      ...workspaceState([]), phase: 'pending', state: 'loading',
    }
    const { renderSlot } = flowProbe()
    render(
      <WorkspacePicker
        open anchorRef={anchor()} useSessions={hook(sessions)} useWorkspaces={hook(state)}
        useSessionStatus={hook(noPendingInteraction)}
        useSessionRetainInfo={() => undefined}
        usePanelInfo={usePanelInfo} useResource={useResource}
        onPick={vi.fn()} onClose={vi.fn()} createWorkspace={vi.fn()}
        useDirectoryFlow={occupancySource().useDirectoryFlow} renderSlot={renderSlot} t={t}
      />,
    )
    // An empty list is not final yet: jumping into the directory flow here
    // would pre-empt the workspaces about to arrive.
    expect(screen.getByRole('status').textContent).toBe('正在加载工作区…')
    expect(screen.queryByTestId('directory-flow')).toBeNull()
    expect(screen.getByRole('menuitem', { name: '添加工作区…' })).toBeTruthy()
  })

  it('shows no popover at all when nothing is listed and nothing can be added', () => {
    // A composition mounting this package without any directory-picker: the
    // hero anchor has neither a Workspace to pick nor a way to add one, so it
    // must not claim a choice with an empty menu.
    const b = mount([], vi.fn(), occupancySource(false))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByTestId('directory-flow')).toBeNull()
    expect(b.createWorkspace).not.toHaveBeenCalled()
  })

  it('keeps one draft while a pending save outlives removal of the listed workspace', async () => {
    let resolve!: (workspace: WorkspaceView) => void
    const pending = new Promise<WorkspaceView>((settle) => { resolve = settle })
    const b = mount([workspace('alpha', 'Alpha')], vi.fn(() => pending))
    chooseAdd()
    await act(async () => { b.probe.owner!.onPicked('/tmp/project') })
    fireEvent.click(screen.getByRole('button', { name: '创建工作区' }))
    act(() => { b.rerenderItems([]) })
    expect(b.createWorkspace).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(workspace('adopted')); await pending })
    expect(b.onPick).toHaveBeenCalledTimes(1)
  })

  it('hides the add entry while the directory-flow hole is empty', () => {
    mount([workspace('alpha', 'Alpha')], vi.fn(), occupancySource(false))
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: '添加工作区…' })).toBeNull()
  })

  it('shows the add entry when a flow package activates after the first paint', () => {
    const b = mount([workspace('alpha', 'Alpha')], vi.fn(), occupancySource(false))
    expect(screen.queryByRole('menuitem', { name: '添加工作区…' })).toBeNull()
    // Registration changes flow through the subscription, no re-render needed.
    act(() => { b.occupancy.flip(true) })
    expect(screen.getByRole('menuitem', { name: '添加工作区…' })).toBeTruthy()
  })

  it('retains a refused draft and disables adding folders when the picker is unavailable', async () => {
    const b = mount([workspace('alpha', 'Alpha')], vi.fn(async () => { throw new Error('save failed') }))
    chooseAdd()
    await act(async () => { b.probe.owner!.onPicked('/one/project') })
    fireEvent.click(screen.getByRole('button', { name: '创建工作区' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('save failed') })
    act(() => { b.occupancy.flip(false) })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '添加文件夹' }).disabled).toBe(true)
    expect(screen.getByText('/one/project')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole<HTMLButtonElement>('menuitem', { name: 'Alpha' }).disabled).toBe(false)
  })

  it('withdraws an unloaded directory flow while retaining the draft until cancellation', () => {
    const b = mount()
    chooseAdd()
    expect(screen.getByTestId('directory-flow')).toBeTruthy()
    act(() => { b.occupancy.flip(false) })
    expect(b.probe.owner!.open).toBe(false)
    expect(screen.getByRole('dialog', { name: '创建工作区' })).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '添加文件夹' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole<HTMLButtonElement>('menuitem', { name: 'Alpha' }).disabled).toBe(false)
  })

})


it('keeps selected directories in a draft until the workspace is saved', async () => {
  const b = mount()
  chooseAdd(false)
  expect(screen.getByRole('dialog', { name: '创建工作区' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '添加文件夹' }))
  await act(async () => { b.probe.owner!.onPicked('/projects/first') })
  expect(b.createWorkspace).not.toHaveBeenCalled()
  expect(screen.getByText('/projects/first')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '添加文件夹' }))
  await act(async () => { b.probe.owner!.onPicked('/projects/second') })
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '移除 /projects/first' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '设为主要 /projects/second' }))
  fireEvent.click(screen.getByRole('button', { name: '移除 /projects/first' }))
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(b.createWorkspace).not.toHaveBeenCalled()
})
