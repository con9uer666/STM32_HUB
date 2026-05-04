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
  githubProxy?: string
  theme: 'dark' | 'light'
  scanDepth: number
  tutorialUpdateSha?: string
  tutorialUpdateTime?: number
}
