import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import { AlertCircle, Check, FileText, Globe, Loader2, LogIn, Monitor } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $profiles, refreshActiveProfile } from '@/store/profile'

import { CONTROL_TEXT } from './constants'
import { EmptyState, ListRow, LoadingState, Pill, SettingsContent } from './primitives'
import { useGatewayConnection } from './use-gateway-connection'

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

function ScopeChip({ active, label, onSelect }: { active: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      className={cn(
        'rounded-full border px-3 py-1 text-[length:var(--conversation-caption-font-size)] transition',
        active
          ? 'border-(--ui-stroke-secondary) bg-(--ui-bg-tertiary) text-(--ui-text-primary)'
          : 'border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)'
      )}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  )
}

export function GatewaySettings() {
  const { t } = useI18n()
  const g = t.settings.gateway

  // Connection scope: null = the global/default connection (the original
  // behavior); a profile name = that profile's per-profile remote override, so
  // each profile can point at its own backend.
  const [scope, setScope] = useState<null | string>(null)
  const profiles = useStore($profiles)

  useEffect(() => {
    void refreshActiveProfile()
  }, [])

  const {
    authMode,
    authResolved,
    available,
    canUseRemote,
    isPasswordProvider,
    lastTest,
    loading,
    oauthConnected,
    probe,
    probeRemoteUrl,
    probeStatus,
    providerLabel,
    remoteToken,
    save,
    saving,
    setAllowInvalidCertificate,
    setMode,
    setRemoteToken,
    setRemoteUrl,
    signIn,
    signingIn,
    signOut,
    state,
    testRemote,
    testing,
    trimmedUrl
  } = useGatewayConnection(scope)

  // The 'default' profile uses the global ("All profiles") connection, so the
  // per-profile scopes are the named, non-default profiles.
  const namedProfiles = useMemo(() => profiles.filter(profile => profile.name !== 'default'), [profiles])

  if (loading) {
    return <LoadingState label={g.loading} />
  }

  if (!available) {
    return <EmptyState description={g.unavailableDesc} title={g.unavailableTitle} />
  }

  return (
    <SettingsContent>
      <div className="mb-5">
        <div className="flex items-center gap-2 text-[length:var(--conversation-text-font-size)] font-medium">
          <Globe className="size-4 text-muted-foreground" />
          {g.title}
          {state.envOverride ? <Pill tone="primary">{g.envOverride}</Pill> : null}
        </div>
        <p className="mt-2 max-w-2xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {g.intro}
        </p>
      </div>

      {namedProfiles.length > 0 ? (
        <div className="mb-5 grid gap-2">
          <div className="text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-secondary)">
            {g.appliesTo}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ScopeChip active={scope === null} label={g.allProfiles} onSelect={() => setScope(null)} />
            {namedProfiles.map(profile => (
              <ScopeChip
                active={scope === profile.name}
                key={profile.name}
                label={profile.name}
                onSelect={() => setScope(profile.name)}
              />
            ))}
          </div>
          <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {scope === null ? g.defaultConnection : g.profileConnection(scope)}
          </p>
        </div>
      ) : null}

      {state.envOverride ? (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[length:var(--conversation-caption-font-size)] text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">{g.envOverrideTitle}</div>
            <div className="mt-1 leading-5">{g.envOverrideDesc}</div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          active={state.mode === 'local'}
          description={g.localDesc}
          disabled={state.envOverride}
          icon={Monitor}
          onSelect={() => setMode('local')}
          title={g.localTitle}
        />
        <ModeCard
          active={state.mode === 'remote'}
          description={g.remoteDesc}
          disabled={state.envOverride}
          icon={Globe}
          onSelect={() => setMode('remote')}
          title={g.remoteTitle}
        />
      </div>

      <div className="mt-5 grid gap-1">
        <ListRow
          action={
            <Input
              className={cn('h-8', CONTROL_TEXT)}
              disabled={state.envOverride}
              onBlur={() => void probeRemoteUrl()}
              onChange={event => setRemoteUrl(event.target.value)}
              placeholder="https://gateway.example.com/hermes"
              value={state.remoteUrl}
            />
          }
          description={g.remoteUrlDesc}
          title={g.remoteUrlTitle}
        />

        {state.mode === 'remote' && probeStatus === 'probing' ? (
          <div className="flex items-center gap-2 py-3 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
            <Loader2 className="size-4 animate-spin" />
            {g.probing}
          </div>
        ) : null}

        {state.mode === 'remote' && probeStatus === 'error' ? (
          <div className="flex items-start gap-2 py-3 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {g.probeError}
              {probe?.error ? (
                <span className="mt-0.5 block font-mono text-(--ui-text-quaternary)">{probe.error}</span>
              ) : null}
            </span>
          </div>
        ) : null}

        {/* OAuth / password gateways: present a sign-in button + connection status. */}
        {state.mode === 'remote' && authResolved && authMode === 'oauth' ? (
          <ListRow
            action={
              oauthConnected ? (
                <div className="flex items-center gap-2">
                  <Pill tone="primary">
                    <Check className="size-3" /> {g.signedIn}
                  </Pill>
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
              )
            }
            description={
              oauthConnected
                ? isPasswordProvider
                  ? g.authSignedInPassword
                  : g.authSignedInOauth
                : isPasswordProvider
                  ? g.authNeedsPassword
                  : g.authNeedsOauth(providerLabel)
            }
            title={g.authTitle}
          />
        ) : null}

        {/* Session-token gateways: keep the existing token entry box. */}
        {state.mode === 'remote' && authResolved && authMode === 'token' ? (
          <ListRow
            action={
              <Input
                autoComplete="off"
                className={cn('h-8 font-mono', CONTROL_TEXT)}
                disabled={state.envOverride}
                onChange={event => setRemoteToken(event.target.value)}
                placeholder={
                  state.remoteTokenSet ? g.existingToken(state.remoteTokenPreview ?? g.savedToken) : g.pasteSessionToken
                }
                type="password"
                value={remoteToken}
              />
            }
            description={g.tokenDesc}
            title={g.tokenTitle}
          />
        ) : null}

        {/* TLS bypass for a self-signed / untrusted gateway certificate. */}
        {state.mode === 'remote' ? (
          <ListRow
            action={
              <Switch
                checked={state.remoteAllowInvalidCertificate}
                disabled={state.envOverride}
                onCheckedChange={setAllowInvalidCertificate}
              />
            }
            description={g.insecureCertDesc}
            title={g.insecureCertTitle}
          />
        ) : null}
      </div>

      {lastTest ? <div className="mt-4 text-xs text-primary">{lastTest}</div> : null}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-4">
        <Button
          className="mr-auto"
          disabled={state.envOverride || testing || !canUseRemote}
          onClick={() => void testRemote()}
          size="sm"
          variant="text"
        >
          {testing ? <Loader2 className="animate-spin" /> : null}
          {g.testRemote}
        </Button>
        <Button disabled={state.envOverride || saving} onClick={() => void save(false)} size="sm" variant="textStrong">
          {g.saveForRestart}
        </Button>
        <Button disabled={state.envOverride || saving} onClick={() => void save(true)} size="sm">
          {saving ? <Loader2 className="animate-spin" /> : null}
          {g.saveAndReconnect}
        </Button>
      </div>

      <div className="mt-6 grid gap-1">
        <ListRow
          action={
            <Button onClick={() => void window.hermesDesktop?.revealLogs()} size="sm" variant="textStrong">
              <FileText />
              {g.openLogs}
            </Button>
          }
          description={g.diagnosticsDesc}
          title={g.diagnostics}
        />
      </div>
    </SettingsContent>
  )
}
