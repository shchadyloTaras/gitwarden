import { app, BrowserWindow, shell } from 'electron'
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
import { SecretStore } from '../src/main/storage/SecretStore.js'
import {
  TokenStore,
  TokenStoreDataSchema,
  TOKEN_STORE_DEFAULTS,
} from '../src/main/storage/TokenStore.js'
import { FetchHttpClient } from '../src/main/services/FetchHttpClient.js'
import { GitHubAuthService } from '../src/main/services/GitHubAuthService.js'
import { GitHubApiService } from '../src/main/services/GitHubApiService.js'
import {
  GitHubAuthCoordinator,
  type GitHubAuthCoordinatorDeps,
} from '../src/main/ipc/GitHubAuthCoordinator.js'
import { GITHUB_OAUTH_SCOPES } from '../src/core/config/github.js'
import { createGitHubAuthTestServices } from '../src/main/testing/githubAuthFakes.js'

/** True when launched by the Playwright e2e harness — fakes + no real browser. */
const IS_E2E_FAKE_GITHUB = process.env['GITWARDEN_E2E_FAKE_GITHUB'] === '1'

/** The single browser-open seam, shared by the shell channel and the auth coordinator. */
const openExternal = IS_E2E_FAKE_GITHUB
  ? (_url: string): void => {}
  : (url: string): void => {
      void shell.openExternal(url)
    }

/**
 * Builds the GitHub-auth service trio. Under the e2e flag the services are fakes and no
 * real GitHub call happens in CI (docs/plans/github-oauth-plan.md §6 Phase 25).
 * Production uses the real device-flow service, REST client, and encrypted TokenStore.
 */
function buildGitHubAuthDeps(
  profiles: ProfileService,
  userDataPath: string
): GitHubAuthCoordinatorDeps {
  if (IS_E2E_FAKE_GITHUB) {
    const fakes = createGitHubAuthTestServices()
    return { ...fakes, profiles, openExternal, scopes: GITHUB_OAUTH_SCOPES }
  }

  const http = new FetchHttpClient()
  const tokensStore = new JsonStore(
    path.join(userDataPath, 'tokens.json'),
    TokenStoreDataSchema,
    TOKEN_STORE_DEFAULTS
  )
  return {
    auth: new GitHubAuthService(http),
    api: new GitHubApiService(http),
    tokens: new TokenStore(tokensStore, new SecretStore()),
    profiles,
    openExternal,
    scopes: GITHUB_OAUTH_SCOPES,
  }
}

app.setName('GitWarden')

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

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.webContents.on('before-input-event', (event, input) => {
      const isDevToolsShortcut =
        (input.key.toLowerCase() === 'i' && input.meta && input.alt) || input.key === 'F12'

      if (isDevToolsShortcut) {
        event.preventDefault()
        win.webContents.toggleDevTools()
      }
    })
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

  const initialSettings = await settingsStore.read()
  let gitPath: string
  try {
    gitPath = await GitLocator.locate(initialSettings.customGitPath)
  } catch {
    gitPath = await GitLocator.locate()
  }
  const gitRunner = new GitRunner(gitPath)

  const profiles = new ProfileService(profilesStore)
  const github = new GitHubAuthCoordinator(buildGitHubAuthDeps(profiles, userDataPath))

  registerIpcHandlers({
    profiles,
    repositories: new RepositoryService(reposStore),
    settings: new SettingsService(settingsStore),
    git: new GitService(gitRunner),
    github,
    openExternal,
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
