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

macOS says: _"GitWarden can't be opened because Apple cannot check it for malicious software."_

1. Right-click (or Control-click) **GitWarden.app** in your Applications folder
2. Choose **Open** from the menu — a new dialog appears
3. Click **Open** again

After this, GitWarden opens normally without any warning.

> This warning goes away once code signing ships. It is tracked in the build plan as Phase 43 (Code Signing & Notarization).

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
