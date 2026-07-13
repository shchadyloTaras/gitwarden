---
name: landing-preview
description: Start the GitWarden landing-site preview server. Use when the user asks to launch, preview, or inspect the local landing site without publishing it.
---

# Landing Preview

Run the landing preview from the repository root.

1. Start `npm --prefix landing run preview -- --port 4321` in a persistent terminal session.
2. If port 4321 is occupied, leave the existing process untouched and retry on an available port.
3. Report the local URL once the server is ready.
4. Do not edit files, publish, or stop another process as part of starting the preview.
5. Keep the preview running until the user asks to stop it.
