import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { $desktopBoot } from '@/store/boot'
import { $connectionModeDialog } from '@/store/connection-mode'
import { $desktopOnboarding, type DesktopOnboardingState, type OnboardingContext } from '@/store/onboarding'
import type { OAuthProvider } from '@/types/hermes'

import { DesktopOnboardingOverlay, Picker } from './desktop-onboarding-overlay'

function provider(id: string, name = id): OAuthProvider {
  return {
    cli_command: `hermes login ${id}`,
    docs_url: `https://example.com/${id}`,
    flow: 'pkce',
    id,
    name,
    status: { logged_in: false }
  }
}

function setProviders(providers: OAuthProvider[]) {
  $desktopOnboarding.set({
    configured: false,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false
  } satisfies DesktopOnboardingState)
}

const ctx: OnboardingContext = { requestGateway: async () => undefined as never }

afterEach(() => {
  cleanup()

  try {
    window.localStorage.clear()
  } catch {
    // jsdom localStorage should always be present; ignore if not.
  }

  $desktopOnboarding.set({
    configured: null,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers: null,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false
  })
  $connectionModeDialog.set({ open: false, prefill: null, firstRun: false })
})

describe('onboarding overlay first-run stand-down', () => {
  const overlayCtx: OnboardingContext = { requestGateway: async () => undefined as never }

  // Before any backend exists, onboarding.configured is null → the overlay's
  // `Preparing` splash renders at z-1300. If the blocking first-run chooser is
  // up, that splash would cover it and strand the user on a "Starting…/2%"
  // screen. The overlay must stand down while the chooser owns the screen.
  it('renders nothing while the blocking first-run chooser is active', () => {
    $connectionModeDialog.set({ open: true, prefill: null, firstRun: true })
    $desktopBoot.set({
      error: null,
      fakeMode: false,
      message: 'Waiting to start Hermes backend',
      phase: 'renderer.first-run',
      progress: 0,
      running: false,
      timestamp: Date.now(),
      visible: false
    })

    const { container } = render(<DesktopOnboardingOverlay enabled={false} requestGateway={overlayCtx.requestGateway} />)

    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  // Contrast: with no first-run chooser up and configured still unknown, the
  // Preparing splash renders as normal (proves the guard is specific to the
  // first-run chooser, not a blanket suppression).
  it('still shows the preparing splash during a normal (non-first-run) boot', () => {
    $connectionModeDialog.set({ open: false, prefill: null, firstRun: false })
    $desktopBoot.set({
      error: null,
      fakeMode: false,
      message: 'Starting Hermes backend',
      phase: 'backend.spawn',
      progress: 40,
      running: true,
      timestamp: Date.now(),
      visible: true
    })

    render(<DesktopOnboardingOverlay enabled={false} requestGateway={overlayCtx.requestGateway} />)

    expect(screen.getByRole('status')).toBeTruthy()
  })
})

describe('onboarding Picker', () => {
  it('features Nous Portal and hides other providers behind a disclosure', () => {
    setProviders([provider('anthropic', 'Anthropic Claude'), provider('nous', 'Nous Portal')])
    render(<Picker ctx={ctx} />)

    expect(screen.getByText('Nous Portal')).toBeTruthy()
    expect(screen.getByText('Recommended')).toBeTruthy()
    expect(screen.queryByText('Anthropic API Key')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Other providers' }))

    expect(screen.getByText('Anthropic API Key')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy()
  })

  it('shows every provider directly when Nous Portal is absent', () => {
    setProviders([provider('anthropic', 'Anthropic Claude'), provider('openai-codex', 'OpenAI Codex / ChatGPT')])
    render(<Picker ctx={ctx} />)

    expect(screen.getByText('Anthropic API Key')).toBeTruthy()
    expect(screen.getByText('OpenAI OAuth (ChatGPT)')).toBeTruthy()
    expect(screen.queryByText('Other sign-in options')).toBeNull()
    expect(screen.queryByText('Recommended')).toBeNull()
  })

  it('offers "choose later" on first run and persists the skip', () => {
    setProviders([provider('nous', 'Nous Portal')])
    render(<Picker ctx={ctx} />)

    const skip = screen.getByRole('button', { name: "I'll choose a provider later" })

    fireEvent.click(skip)

    expect($desktopOnboarding.get().firstRunSkipped).toBe(true)
    expect(window.localStorage.getItem('hermes-onboarding-skipped-v1')).toBe('1')
  })

  it('hides "choose later" in manual (add-provider) mode', () => {
    setProviders([provider('nous', 'Nous Portal')])
    $desktopOnboarding.set({ ...$desktopOnboarding.get(), manual: true })
    render(<Picker ctx={ctx} />)

    expect(screen.queryByRole('button', { name: "I'll choose a provider later" })).toBeNull()
  })
})
