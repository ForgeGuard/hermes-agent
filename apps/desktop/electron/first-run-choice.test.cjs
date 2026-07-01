/**
 * Tests for electron/first-run-choice.cjs.
 *
 * Run with: node --test electron/first-run-choice.test.cjs
 * (Wired into npm test:desktop:platforms in package.json.)
 *
 * These are the pure helpers behind the desktop's first-run "local runtime vs
 * external Hermes backend" choice: the persisted record shape and the gate that
 * decides whether to ask before starting a local install.
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  FIRST_RUN_CHOICES,
  FIRST_RUN_CHOICE_SCHEMA_VERSION,
  buildFirstRunChoiceRecord,
  firstRunChoiceRequired,
  normalizeFirstRunChoice
} = require('./first-run-choice.cjs')

// --- normalizeFirstRunChoice ---

test('normalizeFirstRunChoice accepts a well-formed local record', () => {
  const rec = normalizeFirstRunChoice({
    schemaVersion: FIRST_RUN_CHOICE_SCHEMA_VERSION,
    choice: 'local',
    completedAt: '2026-01-01T00:00:00.000Z'
  })
  assert.deepEqual(rec, {
    schemaVersion: FIRST_RUN_CHOICE_SCHEMA_VERSION,
    choice: 'local',
    completedAt: '2026-01-01T00:00:00.000Z'
  })
})

test('normalizeFirstRunChoice accepts remote and tolerates a missing timestamp', () => {
  const rec = normalizeFirstRunChoice({ schemaVersion: FIRST_RUN_CHOICE_SCHEMA_VERSION, choice: 'remote' })
  assert.equal(rec.choice, 'remote')
  assert.equal(rec.completedAt, null)
})

test('normalizeFirstRunChoice rejects malformed / stale / unknown records', () => {
  assert.equal(normalizeFirstRunChoice(null), null)
  assert.equal(normalizeFirstRunChoice('local'), null)
  assert.equal(normalizeFirstRunChoice({}), null)
  // wrong schema version
  assert.equal(normalizeFirstRunChoice({ schemaVersion: 999, choice: 'local' }), null)
  // unrecognized choice
  assert.equal(normalizeFirstRunChoice({ schemaVersion: FIRST_RUN_CHOICE_SCHEMA_VERSION, choice: 'nope' }), null)
})

// --- buildFirstRunChoiceRecord ---

test('buildFirstRunChoiceRecord stamps schema + timestamp for each valid choice', () => {
  for (const choice of FIRST_RUN_CHOICES) {
    const rec = buildFirstRunChoiceRecord(choice, '2026-02-02T02:02:02.000Z')
    assert.equal(rec.schemaVersion, FIRST_RUN_CHOICE_SCHEMA_VERSION)
    assert.equal(rec.choice, choice)
    assert.equal(rec.completedAt, '2026-02-02T02:02:02.000Z')
    // Round-trips through the normalizer.
    assert.deepEqual(normalizeFirstRunChoice(rec), rec)
  }
})

test('buildFirstRunChoiceRecord defaults the timestamp when omitted', () => {
  const rec = buildFirstRunChoiceRecord('local')
  assert.equal(typeof rec.completedAt, 'string')
  assert.ok(!Number.isNaN(Date.parse(rec.completedAt)))
})

test('buildFirstRunChoiceRecord throws on an unknown choice (no silent junk record)', () => {
  assert.throws(() => buildFirstRunChoiceRecord('nuke'), /Unknown first-run choice/)
  assert.throws(() => buildFirstRunChoiceRecord(''), /Unknown first-run choice/)
})

// --- firstRunChoiceRequired ---

test('firstRunChoiceRequired is true only on a truly fresh install', () => {
  assert.equal(
    firstRunChoiceRequired({ choiceRecorded: false, hasExplicitRemote: false, hasExistingLocalInstall: false }),
    true
  )
})

test('firstRunChoiceRequired is false once a choice was recorded', () => {
  assert.equal(
    firstRunChoiceRequired({ choiceRecorded: true, hasExplicitRemote: false, hasExistingLocalInstall: false }),
    false
  )
})

test('firstRunChoiceRequired is false when an explicit remote target already exists', () => {
  assert.equal(
    firstRunChoiceRequired({ choiceRecorded: false, hasExplicitRemote: true, hasExistingLocalInstall: false }),
    false
  )
})

test('firstRunChoiceRequired is false for a returning local install', () => {
  assert.equal(
    firstRunChoiceRequired({ choiceRecorded: false, hasExplicitRemote: false, hasExistingLocalInstall: true }),
    false
  )
})

test('firstRunChoiceRequired defaults to asking when signals are absent', () => {
  assert.equal(firstRunChoiceRequired(), true)
  assert.equal(firstRunChoiceRequired({}), true)
})
