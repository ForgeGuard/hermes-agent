/**
 * after-pack.cjs — electron-builder afterPack hook.
 *
 * Stamps the Hermes icon + identity onto the packed Windows Hermes.exe via
 * rcedit (delegated to set-exe-identity.cjs). This runs for EVERY packed build
 * — first install, `hermes desktop`, the installer's --update rebuild, and a
 * dev's manual `npm run pack` — so the branded exe can never silently revert
 * to the stock "Electron" icon/name (the bug when the stamp lived only in
 * install.ps1, which the update path doesn't use).
 *
 * On Windows: rcedit edits PE resources. Best-effort: a stamp failure must
 * never fail an otherwise-good build (worst case is the stock icon, not a
 * broken app), so we log and resolve rather than throw.
 *
 * On macOS: guarantee the packed bundle carries at least an AD-HOC code
 * signature. electron-builder skips its signing pass entirely when it detects
 * a pull-request build (release-on-merge.yml is pull_request-triggered) or
 * when no identity is discoverable — and on Apple Silicon a fully unsigned,
 * quarantined app fails Gatekeeper's assessment with "«app» is damaged and
 * can't be opened" before a single line of main.cjs runs (this shipped in
 * v2026.7.1-forgeguard.1). afterPack runs before electron-builder's own sign
 * step, so when that step does run (a real Developer ID someday) it simply
 * re-signs over this; when it skips, this signature is what lands in the
 * dmg/zip. Deliberately plain ad-hoc — no --options runtime, no entitlements:
 * hardened runtime only matters for notarization, and without the entitlement
 * file an ad-hoc hardened binary would break Electron's JIT. Unlike the
 * Windows stamp this THROWS on failure: an unsigned arm64 bundle is a broken
 * deliverable, not a cosmetic defect.
 *
 * electron-builder passes a context with:
 *   - electronPlatformName: 'win32' | 'darwin' | 'linux'
 *   - appOutDir:            the unpacked app directory for this target
 *   - packager.appInfo.productFilename: the exe basename (e.g. 'Hermes')
 */

const { execFileSync } = require('node:child_process')
const path = require('node:path')

const { stampExeIdentity } = require('./set-exe-identity.cjs')

function adhocSignMacBundle(context) {
  const productName = context.packager?.appInfo?.productFilename || 'Hermes'
  const appPath = path.join(context.appOutDir, `${productName}.app`)

  console.log(`[after-pack] ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit'
  })
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') {
    adhocSignMacBundle(context)
    return
  }

  if (context.electronPlatformName !== 'win32') {
    return
  }

  const productName = context.packager?.appInfo?.productFilename || 'Hermes'
  const exe = path.join(context.appOutDir, `${productName}.exe`)
  const desktopRoot = path.resolve(__dirname, '..')

  try {
    await stampExeIdentity(exe, desktopRoot)
  } catch (err) {
    // Never fail the build over a cosmetic stamp.
    console.warn(`[after-pack] exe identity stamp failed (${err.message}); Hermes.exe keeps the stock Electron icon`)
  }
}
