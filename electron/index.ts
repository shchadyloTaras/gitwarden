import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { GitLocator } from '../src/main/git/GitLocator.js'
import { GitRunner } from '../src/main/git/GitRunner.js'
import { GitService } from '../src/main/services/GitService.js'
import { JsonStore } from '../src/main/storage/JsonStore.js'
import { ProfileService } from '../src/main/services/ProfileService.js'
import { RepositoryService } from '../src/main/services/RepositoryService.js'
import { SettingsService } from '../src/main/services/SettingsService.js'
import {
  ProfilesDataSchema,
  RepositoriesDataSchema,
  AppSettingsSchema,
} from '../src/core/schemas.js'
import { registerIpcHandlers } from '../src/main/ipc/ipc-handlers.js'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'GitWarden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData')

  const profilesStore = new JsonStore(
    path.join(userDataPath, 'profiles.json'),
    ProfilesDataSchema,
    { profiles: [] }
  )
  const reposStore = new JsonStore(
    path.join(userDataPath, 'repositories.json'),
    RepositoriesDataSchema,
    { repositories: [] }
  )
  const settingsStore = new JsonStore(path.join(userDataPath, 'settings.json'), AppSettingsSchema, {
    appearance: 'system',
  })

  const gitPath = await GitLocator.locate()
  const gitRunner = new GitRunner(gitPath)

  registerIpcHandlers({
    profiles: new ProfileService(profilesStore),
    repositories: new RepositoryService(reposStore),
    settings: new SettingsService(settingsStore),
    git: new GitService(gitRunner),
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
