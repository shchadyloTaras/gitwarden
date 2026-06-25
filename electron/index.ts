import { app, BrowserWindow, session, shell } from 'electron'
import path from 'node:path'
import {
  installContentSecurityPolicy,
  isDevRenderer,
} from '../src/main/security/contentSecurityPolicy.js'
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
import { AiConnectionsDataSchema } from '../src/core/ai/schemas.js'
import { registerIpcHandlers } from '../src/main/ipc/ipc-handlers.js'
import { SecretStore } from '../src/main/storage/SecretStore.js'
import { AiConnectionService } from '../src/main/services/AiConnectionService.js'
import {
  AiCredentialStore,
  AiCredentialStoreDataSchema,
  AI_CREDENTIAL_STORE_DEFAULTS,
  type IAiCredentialStore,
} from '../src/main/storage/AiCredentialStore.js'
import {
  createAiTestAdapterRegistry,
  createAiTestCredentialStore,
} from '../src/main/testing/aiFakes.js'
import { createAiAdapterRegistry } from '../src/main/ai/index.js'
import { AiContextBuilder } from '../src/main/ai/AiContextBuilder.js'
import { RepoBriefService } from '../src/main/ai/RepoBriefService.js'
import { AiRepoBriefAssistant } from '../src/main/ai/AiRepoBriefAssistant.js'
import { AiFailureExplainerAssistant } from '../src/main/ai/AiFailureExplainerAssistant.js'
import { AiAgenticAssistant } from '../src/main/ai/AiAgenticAssistant.js'
import { AgenticActionExecutor } from '../src/main/ai/AgenticActionExecutor.js'
import { AiCommitAssistant } from '../src/main/ai/AiCommitAssistant.js'
import { AiChangeReviewAssistant } from '../src/main/ai/AiChangeReviewAssistant.js'
import { AiSafetyCopilotAssistant } from '../src/main/ai/AiSafetyCopilotAssistant.js'
import { PushBriefService } from '../src/main/ai/PushBriefService.js'
import { HistorySummaryService } from '../src/main/ai/HistorySummaryService.js'
import { AiPushBriefAssistant } from '../src/main/ai/AiPushBriefAssistant.js'
import { AiChatAssistant } from '../src/main/ai/AiChatAssistant.js'
import { AiHistorySummaryAssistant } from '../src/main/ai/AiHistorySummaryAssistant.js'
import { StagedChangeReviewService } from '../src/main/ai/StagedChangeReviewService.js'
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

/** True for AI e2e — fake (in-memory) credential store so no safeStorage is needed. */
const IS_E2E_FAKE_AI = process.env['GITWARDEN_E2E_FAKE_AI'] === '1'

const IS_DEV_RENDERER = isDevRenderer()

// Vite dev/HMR needs 'unsafe-eval', which triggers Electron's CSP security warning.
// Production loads a bundled renderer with a strict CSP and no eval.
if (IS_DEV_RENDERER) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
}

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
  installContentSecurityPolicy(session.defaultSession, IS_DEV_RENDERER)

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
  const repositories = new RepositoryService(reposStore)
  const settings = new SettingsService(settingsStore)
  const github = new GitHubAuthCoordinator(buildGitHubAuthDeps(profiles, userDataPath))
  const git = new GitService(gitRunner)

  const aiConnectionsStore = new JsonStore(
    path.join(userDataPath, 'ai-connections.json'),
    AiConnectionsDataSchema,
    { connections: [] }
  )
  const aiConnections = new AiConnectionService(aiConnectionsStore)
  const aiCredentials: IAiCredentialStore = IS_E2E_FAKE_AI
    ? createAiTestCredentialStore()
    : new AiCredentialStore(
        new JsonStore(
          path.join(userDataPath, 'ai-credentials.json'),
          AiCredentialStoreDataSchema,
          AI_CREDENTIAL_STORE_DEFAULTS
        ),
        new SecretStore()
      )
  const aiAdapters = IS_E2E_FAKE_AI
    ? createAiTestAdapterRegistry(aiConnections)
    : createAiAdapterRegistry({
        connections: aiConnections,
        credentials: aiCredentials,
        http: new FetchHttpClient(),
      })
  const pushBriefService = new PushBriefService(repositories, profiles, settings, git)
  const historySummaryService = new HistorySummaryService(repositories, git)
  const repoBriefService = new RepoBriefService(repositories, git)
  const aiContextBuilder = new AiContextBuilder({
    profiles,
    repositories,
    settings,
    git,
    aiConnections,
    repoBrief: repoBriefService,
  })
  const aiCommitAssistant = new AiCommitAssistant(aiContextBuilder, aiAdapters)
  const stagedChangeReview = new StagedChangeReviewService(repositories, git)
  const aiChangeReviewAssistant = new AiChangeReviewAssistant(
    stagedChangeReview,
    aiContextBuilder,
    aiAdapters
  )
  const aiSafetyCopilotAssistant = new AiSafetyCopilotAssistant(aiContextBuilder, aiAdapters)
  const aiPushBriefAssistant = new AiPushBriefAssistant(
    pushBriefService,
    aiContextBuilder,
    aiAdapters
  )
  const aiHistorySummaryAssistant = new AiHistorySummaryAssistant(
    historySummaryService,
    aiContextBuilder,
    aiAdapters
  )
  const aiRepoBriefAssistant = new AiRepoBriefAssistant(
    repoBriefService,
    aiContextBuilder,
    aiAdapters
  )
  const aiFailureExplainerAssistant = new AiFailureExplainerAssistant(aiContextBuilder, aiAdapters)
  const aiAgenticAssistant = new AiAgenticAssistant(aiContextBuilder, aiAdapters)
  const aiChatAssistant = new AiChatAssistant(aiContextBuilder, aiAdapters)
  const agenticActionExecutor = new AgenticActionExecutor(repositories)

  registerIpcHandlers({
    profiles,
    repositories,
    settings,
    git,
    github,
    aiConnections,
    aiCredentials,
    aiAdapters,
    aiContextBuilder,
    aiCommitAssistant,
    aiChangeReviewAssistant,
    aiSafetyCopilotAssistant,
    aiPushBriefAssistant,
    aiHistorySummaryAssistant,
    aiRepoBriefAssistant,
    aiFailureExplainerAssistant,
    aiAgenticAssistant,
    aiChatAssistant,
    agenticActionExecutor,
    stagedChangeReview,
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
