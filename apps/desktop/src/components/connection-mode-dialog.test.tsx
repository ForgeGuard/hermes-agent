// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  DesktopConnectionConfig,
  DesktopConnectionConfigInput,
  DesktopConnectionProbeResult
} from '@/global'
import { $connectionModeDialog, openConnectionModeDialog } from '@/store/connection-mode'

import { ConnectionModeDialog } from './connection-mode-dialog'

// The dialog reuses the real useGatewayConnection state machine, so the test
// exercises the full guided Client Mode path end to end against a fake desktop
// IPC surface: pick Client Mode → probe the URL → enter the token → Connect
// calls applyConnectionConfig, and the reverse (Switch to Local) too.

const LOCAL_CONFIG: DesktopConnectionConfig = {
  envOverride: false,
  mode: 'local',
  profile: null,
  remoteAuthMode: 'token',
  remoteOauthConnected: false,
  remoteTokenPreview: null,
  remoteTokenSet: false,
  remoteUrl: ''
}

const REMOTE_CONFIG: DesktopConnectionConfig = {
  envOverride: false,
  mode: 'remote',
  profile: null,
  remoteAuthMode: 'token',
  remoteOauthConnected: false,
  remoteTokenPreview: '••••1234',
  remoteTokenSet: true,
  remoteUrl: 'https://gateway.example.com/hermes'
}

const TOKEN_PROBE: DesktopConnectionProbeResult = {
  authMode: 'token',
  baseUrl: 'https://gateway.example.com/hermes',
  error: null,
  providers: [],
  reachable: true,
  version: '0.17.0'
}

let getConnectionConfig: ReturnType<typeof vi.fn>
let saveConnectionConfig: ReturnType<typeof vi.fn>
let applyConnectionConfig: ReturnType<typeof vi.fn>
let testConnectionConfig: ReturnType<typeof vi.fn>
let probeConnectionConfig: ReturnType<typeof vi.fn>

function installDesktop(initial: DesktopConnectionConfig) {
  getConnectionConfig = vi.fn().mockResolvedValue(initial)
  saveConnectionConfig = vi.fn(async (payload: DesktopConnectionConfigInput) => ({ ...initial, ...payload }))
  applyConnectionConfig = vi.fn(async (payload: DesktopConnectionConfigInput) => ({ ...initial, ...payload }))
  testConnectionConfig = vi.fn().mockResolvedValue({ baseUrl: TOKEN_PROBE.baseUrl, ok: true, version: '0.17.0' })
  probeConnectionConfig = vi.fn().mockResolvedValue(TOKEN_PROBE)

  ;(window as { hermesDesktop?: unknown }).hermesDesktop = {
    getConnectionConfig,
    saveConnectionConfig,
    applyConnectionConfig,
    testConnectionConfig,
    probeConnectionConfig,
    oauthLoginConnectionConfig: vi.fn(),
    oauthLogoutConnectionConfig: vi.fn()
  }
}

function renderDialog(node: ReactNode = <ConnectionModeDialog />) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

beforeEach(() => {
  $connectionModeDialog.set({ open: false, prefill: null })
  installDesktop(LOCAL_CONFIG)
})

afterEach(() => {
  cleanup()
  delete (window as { hermesDesktop?: unknown }).hermesDesktop
})

describe('ConnectionModeDialog', () => {
  it('is inert until opened, then shows both mode cards', async () => {
    renderDialog()
    expect(screen.queryByText('Client Mode')).toBeNull()

    openConnectionModeDialog()

    await waitFor(() => expect(screen.getByText('Local Runtime')).toBeTruthy())
    expect(screen.getByText('Client Mode')).toBeTruthy()
    // Starts on the current (local) mode, so no URL field yet.
    expect(screen.queryByPlaceholderText(/gateway.example.com/i)).toBeNull()
  })

  it('guides Client Mode: probe → token → Connect applies the remote config', async () => {
    renderDialog()
    openConnectionModeDialog()
    await waitFor(() => expect(screen.getByText('Client Mode')).toBeTruthy())

    fireEvent.click(screen.getByText('Client Mode'))

    const url = await screen.findByPlaceholderText(/gateway.example.com/i)
    fireEvent.change(url, { target: { value: 'https://gateway.example.com/hermes' } })

    // Debounced probe resolves as a token gateway → token box surfaces.
    await waitFor(() => expect(probeConnectionConfig).toHaveBeenCalledWith('https://gateway.example.com/hermes'), {
      timeout: 2000
    })
    const token = await screen.findByPlaceholderText('Paste session token')
    fireEvent.change(token, { target: { value: 'secret-token' } })

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await waitFor(() => expect(applyConnectionConfig).toHaveBeenCalledTimes(1))
    expect(applyConnectionConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'remote',
        remoteAuthMode: 'token',
        remoteToken: 'secret-token',
        remoteUrl: 'https://gateway.example.com/hermes'
      })
    )
    // A successful apply closes the dialog.
    await waitFor(() => expect($connectionModeDialog.get().open).toBe(false))
  })

  it('switches an already-remote install back to Local Runtime', async () => {
    installDesktop(REMOTE_CONFIG)
    renderDialog()
    openConnectionModeDialog()

    await waitFor(() => expect(screen.getByText('Local Runtime')).toBeTruthy())
    fireEvent.click(screen.getByText('Local Runtime'))

    fireEvent.click(screen.getByRole('button', { name: 'Use Local Runtime' }))

    await waitFor(() => expect(applyConnectionConfig).toHaveBeenCalledWith(expect.objectContaining({ mode: 'local' })))
    await waitFor(() => expect($connectionModeDialog.get().open).toBe(false))
  })

  it('a hermes://connect prefill opens straight into a seeded Client Mode', async () => {
    renderDialog()
    openConnectionModeDialog({ authMode: 'token', token: 'handoff-token', url: 'https://vps.example.com/hermes' })

    const url = await screen.findByPlaceholderText(/gateway.example.com/i)
    await waitFor(() => expect((url as HTMLInputElement).value).toBe('https://vps.example.com/hermes'))
    // Seeded token rides along so the user can Connect without re-typing it.
    await waitFor(() =>
      expect(probeConnectionConfig).toHaveBeenCalledWith('https://vps.example.com/hermes'), { timeout: 2000 }
    )
  })
})
