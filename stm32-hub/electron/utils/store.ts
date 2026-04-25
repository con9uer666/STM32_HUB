import Store from 'electron-store'

export interface Project {
  id: string
  name: string
  path: string
  addedAt: number
  tools: {
    keil?: { uvprojx: string }
    vscode?: { hasCMake: boolean }
    cubemx?: { ioc: string }
  }
  git?: {
    remoteUrl?: string
    owner?: string
    repo?: string
  }
  tags: string[]
  pinned: boolean
  note: string
  color?: string
  aiDescription?: {
    summary: string
    mcu?: string
    peripherals?: string[]
    features?: string[]
    generatedAt: number
  }
}

export interface ToolPaths {
  keil?: string
  cubemx?: string
  vscode?: string
  cmake?: string
  ninja?: string
}

export interface HubSettings {
  toolPaths: ToolPaths
  aiKey?: string
  aiEndpoint: string
  aiModel: string
  githubAuthMode: 'local' | 'pat'
  githubPat?: string
  theme: 'dark' | 'light'
  scanDepth: number
}

interface Schema {
  projects: Project[]
  settings: HubSettings
}

const defaults: Schema = {
  projects: [],
  settings: {
    toolPaths: {},
    aiEndpoint: 'https://api.deepseek.com/chat/completions',
    aiModel: 'deepseek-chat',
    githubAuthMode: 'local',
    theme: 'dark',
    scanDepth: 3
  }
}

export const store = new Store<Schema>({ defaults, name: 'stm32-hub' })
