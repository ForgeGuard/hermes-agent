import { atom } from 'nanostores'

// Prefill for a guided Client Mode setup, typically arriving from a
// `hermes://connect?...` deep link handed off by a Deployment Manager. All
// fields are optional: with none, the dialog opens on the mode picker; with a
// url it opens straight into Client Mode setup seeded with that endpoint.
export interface ConnectionModePrefill {
  authMode?: 'oauth' | 'token'
  token?: string
  url?: string
}

export interface ConnectionModeDialogState {
  open: boolean
  prefill: ConnectionModePrefill | null
  // First-run variant: blocking (no dismiss), first-run copy, and the Local
  // choice records the first-run pick + reloads instead of switching an
  // existing remote back to local. Driven by the boot flow on a fresh install.
  firstRun: boolean
}

const CLOSED: ConnectionModeDialogState = { open: false, prefill: null, firstRun: false }

// The Connection Mode dialog is a single, app-global surface (like the model
// picker / session switcher), so it owns its own atom rather than threading
// open state through the shell. Any trigger — the shell gateway menu, the boot
// failure overlay, or a deep link — flips this on.
export const $connectionModeDialog = atom<ConnectionModeDialogState>(CLOSED)

export function openConnectionModeDialog(prefill: ConnectionModePrefill | null = null) {
  $connectionModeDialog.set({ open: true, prefill, firstRun: false })
}

// Open the blocking first-run chooser (fresh install, no backend chosen yet).
export function openFirstRunConnectionChoice() {
  $connectionModeDialog.set({ open: true, prefill: null, firstRun: true })
}

// True while the blocking first-run chooser owns the screen — other boot
// overlays (e.g. the CONNECTING splash) must stand down so it isn't covered.
export function isFirstRunChoiceActive(state: ConnectionModeDialogState) {
  return state.open && state.firstRun
}

export function closeConnectionModeDialog() {
  $connectionModeDialog.set(CLOSED)
}
