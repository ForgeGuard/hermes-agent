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
}

const CLOSED: ConnectionModeDialogState = { open: false, prefill: null }

// The Connection Mode dialog is a single, app-global surface (like the model
// picker / session switcher), so it owns its own atom rather than threading
// open state through the shell. Any trigger — the shell gateway menu, the boot
// failure overlay, or a deep link — flips this on.
export const $connectionModeDialog = atom<ConnectionModeDialogState>(CLOSED)

export function openConnectionModeDialog(prefill: ConnectionModePrefill | null = null) {
  $connectionModeDialog.set({ open: true, prefill })
}

export function closeConnectionModeDialog() {
  $connectionModeDialog.set(CLOSED)
}
