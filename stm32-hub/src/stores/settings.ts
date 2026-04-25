import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'
import type { HubSettings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<HubSettings | null>(null)

  async function load() {
    settings.value = await api.settings.getAll()
    return settings.value
  }

  async function set(key: string, value: unknown) {
    settings.value = await api.settings.set(key, value)
  }

  async function detectTools() {
    const result = await api.settings.detectTools()
    settings.value = result.settings
    return result
  }

  return { settings, load, set, detectTools }
})
