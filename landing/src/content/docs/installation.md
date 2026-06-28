---
title: Installation
description: Download and install GitWarden on macOS, Windows, or Linux.
order: 2
---

# Installation

## Download

The [home page](/) detects your OS and links the right installer automatically. Or pick from the table below.

| Platform                               | File                        | How to install                               |
| -------------------------------------- | --------------------------- | -------------------------------------------- |
| macOS — Apple Silicon (2020 and later) | `GitWarden-<ver>-arm64.dmg` | Open the DMG, drag GitWarden to Applications |
| macOS — Intel (before 2020)            | `GitWarden-<ver>-x64.dmg`   | Open the DMG, drag GitWarden to Applications |
| Windows                                | `GitWarden-Setup-<ver>.exe` | Run the installer, follow the steps          |
| Linux — most distros                   | `GitWarden-<ver>.AppImage`  | Make it executable, then run it              |
| Linux — Debian / Ubuntu                | `gitwarden_<ver>_amd64.deb` | `sudo apt install ./gitwarden_*.deb`         |

**Not sure which macOS file?** Any Mac bought in 2020 or later has Apple Silicon — use the `arm64` build. Earlier Macs use the `x64` build. Either will work, but the matching build is faster.

## One-time OS warning (unsigned builds)

GitWarden is not yet code-signed. This means macOS and Windows show a warning the first time you open it. The steps below dismiss it permanently — you will not see the warning again for the same version.

### macOS — Gatekeeper

The app is signed (ad-hoc) but not notarized, so macOS blocks the first launch. The wording depends on your macOS version:

- **macOS 15 (Sequoia) and later:** _"Apple could not verify 'GitWarden' is free of malware that may harm your Mac or compromise your privacy."_
- **macOS 14 and earlier:** _"GitWarden can't be opened because Apple cannot check it for malicious software."_

The app is fine — it simply isn't signed by a paid Apple Developer ID yet. Open it once using any of these:

**macOS 15+ (Sequoia and newer) — recommended**

1. In the warning, click **Done** — **not** "Move to Trash" (that deletes the app).
2. Open **System Settings → Privacy & Security**.
3. Scroll to the **Security** section — you'll see _"GitWarden was blocked to protect your Mac."_ Click **Open Anyway**.
4. Confirm with Touch ID or your password, then click **Open** in the final prompt.

**macOS 14 and earlier**

1. Right-click (or Control-click) **GitWarden.app** in Applications → **Open** → **Open**.

**Any macOS — one command in Terminal**

```bash
xattr -dr com.apple.quarantine /Applications/GitWarden.app
```

Then open GitWarden normally. After any of these, it launches without warnings and the exception is remembered for that version.

> This goes away once code signing **and notarization** ship — tracked in the build plan as Phase 43 (Code Signing & Notarization).

### Windows — SmartScreen

Windows says: _"Windows protected your PC — Unknown publisher."_

1. Click **More info** in the SmartScreen dialog
2. Click **Run anyway**

The warning does not reappear for the same version.

### Linux

Linux shows no warning. AppImage files need to be made executable first:

```bash
chmod +x GitWarden-*.AppImage
./GitWarden-*.AppImage
```

The `.deb` package installs via your package manager and creates a desktop entry automatically.
