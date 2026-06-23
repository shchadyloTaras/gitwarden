import { contextBridge } from 'electron'

// Typed IPC bridge — wired in Phase 7.
// Expose only an empty object now so contextIsolation + sandbox are already enforced.
contextBridge.exposeInMainWorld('api', {})
