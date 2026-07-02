# Upstream Sync Skill (ForgeGuard fork)

A step-by-step, agent-agnostic runbook for syncing `ForgeGuard/hermes-agent`
(this fork) to a new `NousResearch/hermes-agent` (upstream) release tag. Works
the same whether you're Cursor, GitHub Copilot, Codex, or Claude Code — it's
plain git + `gh` CLI, no tool-specific features required.

Run this periodically (roughly whenever upstream cuts a new tagged release
you want the fork to track) — not on every upstream commit. The fork
deliberately syncs to **tagged releases**, not the moving `upstream/main` tip,
so the fork's own history has stable, reproducible sync points.

## Prerequisites

- `origin` remote = `ForgeGuard/hermes-agent` (this fork, push access).
- An `upstream` remote pointing at `NousResearch/hermes-agent` (read-only —
  never push here). Add it once if missing:

  ```bash
  git remote add upstream https://github.com/NousResearch/hermes-agent.git
  ```

- `gh` CLI authenticated against a ForgeGuard account with write access to
  the fork.
- A working Python venv (`.venv` or `venv`) with dependencies installed —
  you'll run the full test suite before opening the PR.

## Step-by-step

### 1. Fetch upstream and pick the target tag

```bash
git fetch upstream --tags
git tag -l 'v20*' --sort=-creatordate | head -5   # see recent upstream release tags
```

Pick the **newest tagged release** you want to sync to (not `upstream/main`
directly — that moves under you mid-sync). Confirm it looks right:

```bash
git log -1 <TAG> --format="%H %s %ci"
```

### 2. Create the sync branch off fork `main`

```bash
git checkout main
git pull origin main
git checkout -b sync/upstream-<TAG>
```

Example branch name: `sync/upstream-v2026.7.1`.

### 3. Merge the upstream tag (real merge, never squash/rebase)

```bash
git merge <TAG> --no-edit -m "Merge upstream <TAG> into fork main"
```

A real merge commit (two parents: fork `main` + the upstream tag) is
required — it's what lets a *future* sync's `git merge` correctly compute the
three-way diff against the last sync point. Squashing or rebasing here would
make every subsequent sync re-resolve the same conflicts from scratch.

Expect conflicts to be **small and additive** — the fork's changes touch a
narrow, well-isolated set of files (see the checklist below). If a sync ever
produces conflicts far outside that list, stop and investigate before
resolving; it likely means upstream touched a fork-owned file in a way this
runbook doesn't yet anticipate, or a previous sync resolved something
incorrectly.

### 4. Resolve conflicts, then re-verify the fork-patch checklist

Resolve any real conflicts first (`git status` to list them, fix, `git add`).
Whatever the merge conflict outcome, **explicitly re-verify** every item
below is still present and correct on the merged branch — a clean
auto-merge can silently keep the wrong side, and these are exactly the
places most likely to matter to the fork's own CI/release behavior:

- [ ] **`contributor-check` upstream-only guard** — `.github/workflows/ci.yml`,
      the `contributor-check` job's `if:` includes
      `github.repository == 'NousResearch/hermes-agent'`.
- [ ] **`build-adm-runtime-image.yml`** exists at
      `.github/workflows/build-adm-runtime-image.yml` and still builds +
      pushes `ghcr.io/forgeguard/hermes-agent`.
- [ ] **`build-desktop-client.yml`** exists at
      `.github/workflows/build-desktop-client.yml` with both Linux and macOS
      jobs.
- [ ] **`release-on-merge.yml`** exists at
      `.github/workflows/release-on-merge.yml`.
- [ ] **Upstream-only guards on the three tag/schedule-triggered workflows**
      that would otherwise fire for real on the fork:
      `.github/workflows/upload_to_pypi.yml` (all three jobs: `build`,
      `publish`, `sign` — `sign` has its own explicit `if:` that bypasses the
      default `needs:` success-skip-propagation, so it needs its own guard,
      not just one on `build`), `.github/workflows/deploy-site.yml`
      (`deploy-vercel` job), `.github/workflows/skills-index.yml`
      (`trigger-deploy` job). Pattern: `if: github.repository ==
      'NousResearch/hermes-agent'` (combined with the job's own other
      conditions via `&&`).
      **Audit every job in a multi-job workflow file individually** — a
      guard on the first job in a dependency chain does not automatically
      protect a downstream job that has its own explicit `if:`.
- [ ] **`apps/desktop/vite.config.ts`** test scope fix — `test.include:
      ['src/**/*.test.{ts,tsx}']` (keeps `apps/desktop`'s vitest run from
      sweeping up `electron/**/*.test.cjs` node:test suites).
- [ ] **`apps/desktop/package.json`** has a top-level `"homepage"` field
      (`https://github.com/ForgeGuard/hermes-agent#readme`) — required by
      electron-builder's Linux `deb` target; its absence fails
      `dist:linux` with `Please specify project homepage`.
- [ ] **`workflow_call` upload/push gating** — in both
      `build-desktop-client.yml`'s "Upload Linux/macOS installers" steps and
      `build-adm-runtime-image.yml`'s "Push image to GHCR" step, the `if:`
      must gate on `inputs.upload` / `inputs.push` directly, e.g.
      `if: github.event_name == 'push' || inputs.upload`. **Do not**
      reintroduce `github.event_name == 'workflow_call'` — `github.event_name`
      inside a reusable workflow is always the *caller's* triggering event
      (e.g. `pull_request` for `release-on-merge.yml`), never literally
      `"workflow_call"`. This exact regression silently skipped every
      installer upload and image push for two releases before it was caught
      (2026-07-02) — the jobs report "success" either way, so this only
      surfaces by checking the *individual step* conclusions, not the job
      conclusion.
- [ ] **`README.md`** still has the "Docker (ForgeGuard fork)" quickstart
      section.
- [ ] **`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`** still
      have the "ForgeGuard Fork — Additions Below This Line" section /
      pointer content intact (`AGENTS.md` is the source of truth; the other
      two are thin pointers to it).
- [ ] **`FORK_UPSTREAM_BASE`** — not a merge-conflict risk (you rewrite it in
      step 6), but don't forget it.

If upstream happens to touch one of the above files in a way that creates a
real (non-trivial) conflict, resolve it by keeping upstream's substantive
change and re-applying the fork-only delta on top, rather than reverting to
the fork's pre-sync version wholesale — the fork almost never wants to reject
an upstream improvement to a file it also patches.

### 5. Run the test suite

```bash
scripts/run_tests.sh
```

A merge this size (hundreds of files, hundreds of commits) can surface a
handful of pre-existing or environment-sensitive failures unrelated to the
sync (flaky wall-clock tests, jsdom gaps in `apps/desktop`'s `test:ui`, etc.
— see `AGENTS.md`'s "Known Pitfalls" and the fork-consolidation plan's Phase 1
addendum for precedent). Triage every failure:

- If it reproduces identically on a clean checkout of the upstream tag alone
  (no fork changes), it's pre-existing upstream debt — note it in the PR
  description, don't block on it.
- If it only reproduces on the merged branch, it's a real merge regression —
  fix it before opening the PR.

### 6. Update `FORK_UPSTREAM_BASE`

```bash
echo "<TAG>" > FORK_UPSTREAM_BASE
git add FORK_UPSTREAM_BASE
git commit -m "chore: bump FORK_UPSTREAM_BASE to <TAG>"
```

This file is read by `release-on-merge.yml`'s version-computation step to
build release tags shaped `<TAG>-forgeguard.<n>`. Without it, that workflow
falls back to `git describe --tags --abbrev=0`, which can pick an unrelated
or stale tag.

### 7. Push and open the PR

```bash
git push -u origin sync/upstream-<TAG>
gh pr create --repo ForgeGuard/hermes-agent \
  --title "sync: merge upstream <TAG> into fork main" \
  --base main --head sync/upstream-<TAG> \
  --body "..."
```

Use a **real merge** to land it too (`gh pr merge <N> --merge
--delete-branch=false`), matching this branch's own merge commit — squashing
the PR would throw away the two-parent merge commit structure step 3 relies
on for the *next* sync.

Do **not** open this PR with `head = NousResearch:<branch>` (an upstream
branch directly) — always push your own `sync/upstream-<TAG>` branch to
`origin` first and PR from that. Using an upstream branch as the head means
every new commit pushed to that branch upstream re-triggers a `synchronize`
event on your PR, flooding the fork's Actions tab with blocked "Action
required" runs (harmless but noisy — see the fork-consolidation plan's
Phase 1 addendum for the incident this caused previously).

### 8. Verify CI and the resulting release

After merging, confirm:

- `ci.yml`'s required checks pass on the merge commit.
- `release-on-merge.yml` fires (it triggers on every merged PR to `main`),
  completes fully green, and — check individual **step** conclusions, not
  just job conclusions — actually uploads installers and pushes the ADM
  image rather than silently skipping.
- The resulting GitHub Release is tagged `<TAG>-forgeguard.1` (or the next
  available `.N` if a release without a base-tag bump already used `.1`) and
  has all 5 installers attached (`*.deb`, `*.AppImage`, `*.rpm`, `*.dmg`,
  `*.zip`).

## Why a real merge, not rebase or squash

- **Rebase** would rewrite every fork-only commit's hash and require
  force-pushing `main`, which this repo's git-safety rules forbid.
- **Squash** collapses the two-parent merge structure into one commit whose
  only parent is fork `main` — the next sync's `git merge <newer-tag>` would
  then have to recompute conflicts against the *entire* upstream history
  since the fork point, instead of just the commits between the two tags.
- A **real merge** keeps both parent lineages intact, so each subsequent
  sync only needs to resolve the diff since the *previous* sync tag — the
  conflict surface stays small and bounded release-over-release.
