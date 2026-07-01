/**
 * first-run-choice.cjs
 *
 * Pure, electron-free helpers for the desktop's first-run connection choice:
 * the record shape persisted to `userData/first-run.json`, and the decision of
 * whether the app should still ask the user "set up a local Hermes runtime, or
 * connect to an external Hermes backend?" before it starts a local install.
 *
 * Kept standalone (no `require('electron')`) so it can be unit-tested with
 * `node --test` — same pattern as connection-config.cjs / backend-probes.cjs.
 * main.cjs owns the electron-coupled signals (fs read/write, env, install
 * markers) and passes plain booleans/values into these helpers.
 *
 * Why a first-run gate at all: on a fresh machine the desktop is local-first —
 * `did-finish-load` eagerly bootstraps/installs a local Hermes runtime and the
 * renderer's `getConnection()` spawns it. A user who just wants to point the
 * app at an existing remote backend never gets asked. This gate defers that
 * eager local startup until the user has made an explicit choice ONCE.
 */

// The two things a user can pick on the first-run screen. 'local' → run the
// managed local install/serve path; 'remote' → connect to an external backend
// (the actual URL/auth lives in connection.json, written by the existing
// connection-config flow — this record only remembers that the choice was made).
const FIRST_RUN_CHOICES = ['local', 'remote']

const FIRST_RUN_CHOICE_SCHEMA_VERSION = 1

/**
 * Parse + validate a raw first-run record read from disk. Returns a normalized
 * `{ schemaVersion, choice, completedAt }` or null when the value is missing,
 * malformed, wrong-schema, or carries an unrecognized choice (so a hand-edited
 * or stale file can never wedge the app into "already chosen" with junk).
 */
function normalizeFirstRunChoice(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  if (raw.schemaVersion !== FIRST_RUN_CHOICE_SCHEMA_VERSION) {
    return null
  }
  if (!FIRST_RUN_CHOICES.includes(raw.choice)) {
    return null
  }

  const completedAt = typeof raw.completedAt === 'string' ? raw.completedAt : null

  return { schemaVersion: FIRST_RUN_CHOICE_SCHEMA_VERSION, choice: raw.choice, completedAt }
}

/**
 * Build the record to persist for a given choice. Throws on an unrecognized
 * choice so a caller bug can't write a record that normalizeFirstRunChoice()
 * would later silently drop.
 *
 * @param {'local'|'remote'} choice
 * @param {string} [nowIso] ISO timestamp; defaults to now.
 */
function buildFirstRunChoiceRecord(choice, nowIso) {
  if (!FIRST_RUN_CHOICES.includes(choice)) {
    throw new Error(`Unknown first-run choice: ${choice}`)
  }

  return {
    schemaVersion: FIRST_RUN_CHOICE_SCHEMA_VERSION,
    choice,
    completedAt: typeof nowIso === 'string' && nowIso ? nowIso : new Date().toISOString()
  }
}

/**
 * Decide whether the first-run choice screen should be shown before the app
 * starts a local backend. Any ONE of the bypass signals means "don't ask":
 *
 *   - choiceRecorded         the user already chose once (persisted record).
 *   - hasExplicitRemote      an env override or saved remote config already
 *                            targets an external backend — the decision is
 *                            effectively made; boot straight into remote.
 *   - hasExistingLocalInstall a prior real local install exists (desktop
 *                            bootstrap marker OR a usable active runtime from a
 *                            CLI install). Returning local users are never
 *                            re-prompted.
 *
 * A pure boolean gate: main.cjs computes the three signals from the filesystem,
 * env, and connection.json, then calls this.
 */
function firstRunChoiceRequired({ choiceRecorded, hasExplicitRemote, hasExistingLocalInstall } = {}) {
  if (choiceRecorded || hasExplicitRemote || hasExistingLocalInstall) {
    return false
  }

  return true
}

module.exports = {
  FIRST_RUN_CHOICES,
  FIRST_RUN_CHOICE_SCHEMA_VERSION,
  buildFirstRunChoiceRecord,
  firstRunChoiceRequired,
  normalizeFirstRunChoice
}
