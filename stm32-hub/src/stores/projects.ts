import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { api } from '@/api'
import type { Project } from '@/types'

// Electron IPC uses structuredClone. Vue reactive proxies and undefined-valued
// fields sometimes confuse the cloning algorithm and throw
// "An object could not be cloned." — JSON round-trip guarantees a plain object.
function toPlain<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(toRaw(v)))
  } catch {
    return JSON.parse(JSON.stringify(v))
  }
}

export type SortMode = 'added-desc' | 'added-asc' | 'name-asc' | 'name-desc' | 'modified-desc'
export type ViewMode = 'grid' | 'list'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const searchQuery = ref('')
  const activeTags = ref<string[]>([])
  const loading = ref(false)
  const sortMode = ref<SortMode>('added-desc')
  const viewMode = ref<ViewMode>('grid')
  const gitInfo = ref<Record<string, { branch?: string; ahead: number; behind: number; dirty: boolean; changedCount: number } | null>>({})

  async function load() {
    loading.value = true
    try {
      const list = await api.project.list()
      const seen = new Set<string>()
      const deduped: Project[] = []
      let hadDup = false
      for (const p of list) {
        if (!p || !p.id) continue
        if (seen.has(p.id)) { hadDup = true; continue }
        seen.add(p.id)
        deduped.push(p)
      }
      projects.value = deduped
      // Persist the cleanup back to disk so the duplicate never re-appears.
      // remove-then-upsert because upsert only overwrites the first match.
      if (hadDup) {
        for (const p of deduped) {
          await api.project.remove(p.id)
          await api.project.upsert(toPlain(p))
        }
      }
    } finally {
      loading.value = false
    }
  }

  async function scanFolder(root: string, depth?: number) {
    loading.value = true
    try {
      const result = await api.project.scan(root, depth)
      projects.value = result.projects
      return result
    } finally {
      loading.value = false
    }
  }

  async function addSingle(folder: string) {
    const detected = await api.project.inspect(folder)
    if (!detected) return { added: false, reason: '该目录未识别为 STM32 工程（未找到 .uvprojx / CMakeLists.txt / .ioc）' }
    // Build and upsert via scan (which handles dedup through the scan path, but we only have inspect here)
    const fakeProject: Project = {
      id: btoa(folder).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16),
      name: detected.name,
      path: detected.path,
      addedAt: Date.now(),
      tools: detected.tools,
      tags: [],
      pinned: false,
      note: ''
    }
    projects.value = await api.project.upsert(toPlain(fakeProject))
    return { added: true, project: fakeProject }
  }

  async function upsert(p: Project) {
    projects.value = await api.project.upsert(toPlain(p))
  }

  async function remove(id: string) {
    projects.value = await api.project.remove(id)
  }

  const allTags = computed(() => {
    const set = new Set<string>()
    for (const p of projects.value) {
      if (!Array.isArray(p.tags)) continue
      for (const t of p.tags) if (typeof t === 'string') set.add(t)
    }
    return Array.from(set).sort()
  })

  const filtered = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    const tags = activeTags.value
    // Dedupe by id — defensive against any storage path that could ever
    // insert twice. The old sort would otherwise render a pinned project
    // both at the top AND at its natural position.
    const seen = new Set<string>()
    const list = projects.value.filter(p => {
      if (!p || typeof p !== 'object' || !p.id) return false
      if (seen.has(p.id)) return false
      seen.add(p.id)
      const pTags = Array.isArray(p.tags) ? p.tags : []
      const pName = p.name ?? ''
      const pPath = p.path ?? ''
      const pNote = p.note ?? ''
      if (q) {
        const hay =
          pName.toLowerCase() + ' ' +
          pPath.toLowerCase() + ' ' +
          pTags.join(' ').toLowerCase() + ' ' +
          pNote.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (tags.length && !tags.every(t => pTags.includes(t))) return false
      return true
    })
    const mode = sortMode.value
    return list.slice().sort((a, b) => {
      const ap = !!a.pinned
      const bp = !!b.pinned
      if (ap !== bp) return ap ? -1 : 1
      const aAdded = a.addedAt ?? 0
      const bAdded = b.addedAt ?? 0
      const aName = a.name ?? ''
      const bName = b.name ?? ''
      switch (mode) {
        case 'added-asc': return aAdded - bAdded
        case 'name-asc': return aName.localeCompare(bName)
        case 'name-desc': return bName.localeCompare(aName)
        default: return bAdded - aAdded
      }
    })
  })

  function getById(id: string) {
    return projects.value.find(p => p.id === id)
  }

  async function refreshGitInfo() {
    const paths = projects.value.map(p => p.path)
    if (!paths.length) return
    const r = await api.git.batchStatus(paths)
    if (r.ok) gitInfo.value = r.results as any
  }

  function clearFilters() {
    searchQuery.value = ''
    activeTags.value = []
  }

  return {
    projects, searchQuery, activeTags, loading, sortMode, viewMode, gitInfo,
    load, scanFolder, addSingle, upsert, remove, allTags, filtered, getById,
    refreshGitInfo, clearFilters
  }
})
