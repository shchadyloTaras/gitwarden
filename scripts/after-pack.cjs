// electron-builder `afterPack` hook — runs after the .app is assembled, before signing + dmg.
//
// Ad-hoc signs the macOS app so it carries a VALID code signature even without an Apple
// Developer ID. electron-builder rewrites the app (asar, Info.plist, rename) and, when no
// signing identity is configured, skips re-signing — which leaves the original Electron
// signature invalid. Apple Silicon then refuses to launch the downloaded app, reporting it as
// "damaged". An ad-hoc signature ("-") is valid, so the app opens after the normal Gatekeeper
// prompt instead. If a real Developer ID is configured later (Phase 43), electron-builder's own
// signing step runs after this hook and re-signs over the ad-hoc signature.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`afterPack: ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
