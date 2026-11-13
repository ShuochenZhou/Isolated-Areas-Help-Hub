// State of the UI WeChat draws over a WeChat application: toasts, modals, action sheets, picker
// sheets and the location viewer. src/runtime/shell/Overlays.vue renders it.
import { reactive } from 'vue'

export type ToastIcon = 'success' | 'error' | 'loading' | 'none'

export interface ToastState { id: number; title: string; icon: ToastIcon; image: string; mask: boolean }

export interface ModalOptions {
  title?: string; content?: string; showCancel?: boolean; cancelText?: string; cancelColor?: string
  confirmText?: string; confirmColor?: string; editable?: boolean; placeholderText?: string
}
export interface ModalResult { confirm: boolean; cancel: boolean; content?: string }
export interface ModalState extends Required<Omit<ModalOptions, 'placeholderText'>> {
  id: number; placeholderText: string; value: string; resolve: (result: ModalResult) => void
}

export interface ActionSheetState { id: number; alertText: string; itemList: string[]; itemColor: string; resolve: (index: number) => void }

export interface PickerState {
  id: number
  columns: string[][]
  value: number[]
  /** Called when a column settles, so dependent columns (dates) can be rebuilt. */
  onColumnChange?: (column: number, index: number, value: number[]) => string[][] | void
  resolve: (value: number[] | null) => void
}

export interface LocationState { id: number; latitude: number; longitude: number; name: string; address: string; scale: number; close: () => void }

export const ui = reactive({
  toast: null as ToastState | null,
  modal: null as ModalState | null,
  actionSheet: null as ActionSheetState | null,
  picker: null as PickerState | null,
  location: null as LocationState | null
})

let nextId = 1
let toastTimer: ReturnType<typeof setTimeout> | undefined

export function showToast(options: { title?: string; icon?: ToastIcon; image?: string; duration?: number; mask?: boolean }, loading = false): void {
  clearTimeout(toastTimer)
  ui.toast = {
    id: nextId++,
    title: String(options.title ?? ''),
    icon: loading ? 'loading' : (options.icon || 'success'),
    image: options.image || '',
    mask: Boolean(options.mask)
  }
  if (!loading) toastTimer = setTimeout(hideToast, options.duration ?? 1500)
}

export function hideToast(): void {
  clearTimeout(toastTimer)
  ui.toast = null
}

export function openModal(options: ModalOptions, defaults: { ok: string; cancel: string }): Promise<ModalResult> {
  return new Promise(resolve => {
    ui.modal = {
      id: nextId++,
      title: String(options.title ?? ''),
      content: String(options.content ?? ''),
      showCancel: options.showCancel !== false,
      cancelText: options.cancelText || defaults.cancel,
      cancelColor: options.cancelColor || '#000000',
      confirmText: options.confirmText || defaults.ok,
      confirmColor: options.confirmColor || '#576B95',
      editable: Boolean(options.editable),
      placeholderText: options.placeholderText || '',
      value: '',
      resolve: result => { ui.modal = null; resolve(result) }
    }
  })
}

export function openActionSheet(itemList: string[], options: { alertText?: string; itemColor?: string } = {}): Promise<number> {
  return new Promise(resolve => {
    ui.actionSheet = {
      id: nextId++,
      alertText: options.alertText || '',
      itemList: itemList.map(String),
      itemColor: options.itemColor || '#000000',
      resolve: index => { ui.actionSheet = null; resolve(index) }
    }
  })
}

export function openPicker(columns: string[][], value: number[], onColumnChange?: PickerState['onColumnChange']): Promise<number[] | null> {
  return new Promise(resolve => {
    ui.picker = {
      id: nextId++,
      columns,
      value: value.map((index, column) => Math.min(Math.max(0, index || 0), Math.max(0, (columns[column] || []).length - 1))),
      onColumnChange,
      resolve: result => { ui.picker = null; resolve(result) }
    }
  })
}

export function openLocationViewer(place: Omit<LocationState, 'id' | 'close'>): Promise<void> {
  return new Promise(resolve => {
    ui.location = { ...place, id: nextId++, close: () => { ui.location = null; resolve() } }
  })
}
