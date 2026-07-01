import { useStore } from '@nanostores/react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { SETTINGS_ROUTE } from '@/app/routes'
import { useGatewayConnection } from '@/app/settings/use-gateway-connection'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { AlertCircle, Check, Globe, Loader2, LogIn, Monitor } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  $connectionModeDialog,
  closeConnectionModeDialog,
  type ConnectionModePrefill
} from '@/store/connection-mode'
import { notify } from '@/store/notifications'

function ModeCard({
  active,
  description,
  disabled,
  icon: Icon,
  onSelect,
  title
}: {
  active: boolean
  description: string
  disabled?: boolean
  icon: typeof Monitor
  onSelect: () => void
  title: string
}) {
  return (
    <button
      className={cn(
        'rounded-xl border p-3 text-left transition',
        active
          ? 'border-(--ui-stroke-secondary) bg-(--ui-bg-tertiary)'
          : 'border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) hover:bg-(--chrome-action-hover)',
        disabled && 'cursor-not-allowed opacity-50'
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-2 text-[length:var(--conversation-text-font-size)] font-medium">
        <Icon className="size-4 text-muted-foreground" />
        <span>{title}</span>
        {active ? <Check className="ml-auto size-4 text-primary" /> : null}
      </div>
      <p className="mt-1.5 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
        {description}
      </p>
    </button>
  )
}

function DialogBody({ prefill }: { prefill: ConnectionModePrefill | null }) {
  const { t } = useI18n()
  const c = t.connectionMode
  const g = t.settings.gateway
  const navigate = useNavigate()

  // The dialog always drives the global/default connection ("All profiles").
  // Per-profile remote overrides stay in the full Gateway settings page.
  const conn = useGatewayConnection(null)

  const {
    authMode,
    authResolved,
    canUseRemote,
    isPasswordProvider,
    lastTest,
    loading,
    oauthConnected,
    probeStatus,
    providerLabel,
    remoteToken,
    save,
    saving,
    setMode,
    setRemoteToken,
    setRemoteUrl,
    setState,
    signIn,
    signingIn,
    signOut,
    state,
    switchToLocal,
    testRemote,
    testing,
    trimmedUrl
  } = conn

  // Apply a deep-link / handoff prefill exactly once after the initial config
  // load resolves, so a `hermes://connect?url=…` link lands the user straight in
  // Client Mode seeded with the endpoint (and token, if provided) instead of the
  // bare picker.
  const prefillApplied = useRef(false)
  useEffect(() => {
    if (loading || prefillApplied.current || !prefill?.url) {
      return
    }

    prefillApplied.current = true
    setState(current => ({
      ...current,
      mode: 'remote',
      remoteAuthMode: prefill.authMode ?? current.remoteAuthMode,
      remoteUrl: prefill.url ?? current.remoteUrl
    }))

    if (prefill.token) {
      setRemoteToken(prefill.token)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot seed on first load
  }, [loading])

  const applyLocalMode = async () => {
    if (await switchToLocal()) {
      notify({ kind: 'success', title: c.switchedLocalTitle, message: c.switchedLocalMessage })
      closeConnectionModeDialog()
    }
  }

  const connect = async () => {
    if (await save(true)) {
      notify({ kind: 'success', title: c.connectedTitle, message: c.connectedMessage })
      closeConnectionModeDialog()
    }
  }

  const openFullSettings = () => {
    closeConnectionModeDialog()
    navigate(`${SETTINGS_ROUTE}?tab=gateway`)
  }

  const remote = state.mode === 'remote'

  return (
    <>
      <DialogHeader>
        <DialogTitle icon={Globe}>{c.title}</DialogTitle>
        <DialogDescription>{c.description}</DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
          <Loader2 className="size-4 animate-spin" />
          {g.loading}
        </div>
      ) : (
        <>
          {state.envOverride ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[length:var(--conversation-caption-font-size)] text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">{g.envOverrideTitle}</div>
                <div className="mt-1 leading-5">{g.envOverrideDesc}</div>
              </div>
            </div>
          ) : (
            <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              {remote && trimmedUrl ? c.currentRemote(trimmedUrl) : c.currentLocal}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              active={state.mode === 'local'}
              description={c.localDesc}
              disabled={state.envOverride}
              icon={Monitor}
              onSelect={() => setMode('local')}
              title={c.localTitle}
            />
            <ModeCard
              active={remote}
              description={c.clientDesc}
              disabled={state.envOverride}
              icon={Globe}
              onSelect={() => setMode('remote')}
              title={c.clientTitle}
            />
          </div>

          {remote ? (
            <div className="grid gap-2">
              <label className="grid gap-1.5">
                <span className="text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-secondary)">
                  {c.urlTitle}
                </span>
                <Input
                  autoFocus
                  className="h-8"
                  disabled={state.envOverride}
                  onChange={event => setRemoteUrl(event.target.value)}
                  placeholder="https://gateway.example.com/hermes"
                  value={state.remoteUrl}
                />
                <span className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                  {c.urlDesc}
                </span>
              </label>

              {probeStatus === 'probing' ? (
                <div className="flex items-center gap-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                  <Loader2 className="size-4 animate-spin" />
                  {g.probing}
                </div>
              ) : null}

              {probeStatus === 'error' ? (
                <div className="flex items-start gap-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {g.probeError}
                </div>
              ) : null}

              {/* OAuth / password gateways: sign-in button + status. */}
              {authResolved && authMode === 'oauth' ? (
                <div className="grid gap-1.5">
                  {oauthConnected ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[length:var(--conversation-caption-font-size)] text-primary">
                        <Check className="size-3" /> {g.signedIn}
                      </span>
                      <Button disabled={signingIn || state.envOverride} onClick={() => void signOut()} variant="outline">
                        {signingIn ? <Loader2 className="animate-spin" /> : null}
                        {g.signOut}
                      </Button>
                    </div>
                  ) : (
                    <Button disabled={signingIn || state.envOverride || !trimmedUrl} onClick={() => void signIn()}>
                      {signingIn ? <Loader2 className="animate-spin" /> : <LogIn />}
                      {isPasswordProvider ? g.signIn : g.signInWith(providerLabel)}
                    </Button>
                  )}
                  <span className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                    {oauthConnected
                      ? isPasswordProvider
                        ? g.authSignedInPassword
                        : g.authSignedInOauth
                      : isPasswordProvider
                        ? g.authNeedsPassword
                        : g.authNeedsOauth(providerLabel)}
                  </span>
                </div>
              ) : null}

              {/* Session-token gateways: token entry box. */}
              {authResolved && authMode === 'token' ? (
                <label className="grid gap-1.5">
                  <span className="text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-secondary)">
                    {g.tokenTitle}
                  </span>
                  <Input
                    autoComplete="off"
                    className="h-8 font-mono"
                    disabled={state.envOverride}
                    onChange={event => setRemoteToken(event.target.value)}
                    placeholder={
                      state.remoteTokenSet
                        ? g.existingToken(state.remoteTokenPreview ?? g.savedToken)
                        : g.pasteSessionToken
                    }
                    type="password"
                    value={remoteToken}
                  />
                </label>
              ) : null}

              {lastTest ? <div className="text-xs text-primary">{lastTest}</div> : null}
            </div>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center justify-end gap-3">
            <Button className="mr-auto" onClick={openFullSettings} size="sm" variant="text">
              {c.advanced}
            </Button>
            {remote ? (
              <>
                <Button
                  disabled={state.envOverride || testing || !canUseRemote}
                  onClick={() => void testRemote()}
                  size="sm"
                  variant="textStrong"
                >
                  {testing ? <Loader2 className="animate-spin" /> : null}
                  {g.testRemote}
                </Button>
                <Button
                  disabled={state.envOverride || saving || !canUseRemote}
                  onClick={() => void connect()}
                  size="sm"
                >
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  {c.connect}
                </Button>
              </>
            ) : (
              <Button disabled={state.envOverride || saving} onClick={() => void applyLocalMode()} size="sm">
                {saving ? <Loader2 className="animate-spin" /> : null}
                {c.useLocal}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}

// App-global dialog for switching the desktop between Local Runtime and Client
// Mode. Reuses the same connection state machine + IPC as the full Gateway
// settings page (via useGatewayConnection), so a guided Client Mode setup here
// and the settings page never diverge. Opened from the shell gateway menu, the
// boot failure overlay, or a `hermes://connect` deep link.
export function ConnectionModeDialog() {
  const { open, prefill } = useStore($connectionModeDialog)

  if (!window.hermesDesktop?.getConnectionConfig) {
    return null
  }

  return (
    <Dialog onOpenChange={next => (next ? undefined : closeConnectionModeDialog())} open={open}>
      <DialogContent className="max-w-xl">{open ? <DialogBody prefill={prefill} /> : null}</DialogContent>
    </Dialog>
  )
}
