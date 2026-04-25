<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <div class="app-layout">
            <aside class="side">
              <div class="brand" @click="router.push('/')">
                <div class="brand-mark">
                  <span class="brand-dot"></span>
                </div>
                <div>
                  <div class="logo">STM32</div>
                  <div class="logo-sub">Hub</div>
                </div>
              </div>
              <n-menu
                :value="currentRoute"
                :options="menuOptions"
                :collapsed="false"
                @update:value="handleNav"
                class="side-menu"
              />
              <div class="side-footer">
                <button class="kbd-btn" @click="openPalette" title="Ctrl + Shift + P">
                  ⌘ 命令面板
                </button>
                <button class="kbd-btn subtle" @click="showHelp = true" title="?">
                  快捷键帮助
                </button>
                <div class="version">v{{ version }}</div>
              </div>
            </aside>
            <main class="main">
              <router-view v-slot="{ Component }">
                <transition name="fade" mode="out-in">
                  <component :is="Component" />
                </transition>
              </router-view>
            </main>
          </div>

          <CommandPalette ref="paletteRef" />
          <ShortcutsHelp v-model:show="showHelp" />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { h, computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider,
  NMenu, darkTheme
} from 'naive-ui'
import { useProjectsStore } from '@/stores/projects'
import { useSettingsStore } from '@/stores/settings'
import CommandPalette from '@/components/CommandPalette.vue'
import ShortcutsHelp from '@/components/ShortcutsHelp.vue'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const settingsStore = useSettingsStore()

const version = '0.5.0'
const currentRoute = computed(() => route.name as string)

const paletteRef = ref<any>(null)
const showHelp = ref(false)

const themeOverrides = {
  common: {
    primaryColor: '#3b82f6',
    primaryColorHover: '#60a5fa',
    primaryColorPressed: '#2563eb',
    primaryColorSuppl: '#3b82f6',
    bodyColor: '#0f1014',
    cardColor: '#181920',
    modalColor: '#181920',
    popoverColor: '#1e1f27',
    borderRadius: '8px',
    borderColor: '#262832',
    dividerColor: '#262832',
    hoverColor: 'rgba(59,130,246,.08)',
    textColorBase: '#e7e8ef',
    textColor1: '#f5f6fa',
    textColor2: '#e7e8ef',
    textColor3: '#9395a2',
    placeholderColor: '#6a6d7a',
    fontSize: '14px',
    fontWeightStrong: '600'
  },
  Menu: {
    itemTextColor: '#9395a2',
    itemTextColorHover: '#f5f6fa',
    itemTextColorActive: '#60a5fa',
    itemTextColorActiveHover: '#60a5fa',
    itemIconColor: '#9395a2',
    itemIconColorActive: '#60a5fa',
    itemIconColorActiveHover: '#60a5fa',
    itemColorActive: 'rgba(59,130,246,.12)',
    itemColorActiveHover: 'rgba(59,130,246,.18)',
    borderRadius: '6px'
  },
  Card: {
    borderColor: '#262832',
    color: '#181920'
  },
  Button: {
    borderRadiusMedium: '6px'
  },
  Tabs: {
    tabBorderColor: '#262832',
    tabTextColorLine: '#9395a2',
    tabTextColorActiveLine: '#f5f6fa',
    tabTextColorHoverLine: '#e7e8ef',
    barColor: '#3b82f6'
  }
}

const menuOptions = [
  { label: '仪表盘', key: 'dashboard', icon: () => h('span', { class: 'menu-icon' }, '🗂') },
  { label: '统计面板', key: 'stats', icon: () => h('span', { class: 'menu-icon' }, '📊') },
  { label: '新手教程', key: 'tutorials', icon: () => h('span', { class: 'menu-icon' }, '📖') },
  { label: '串口助手', key: 'serial', icon: () => h('span', { class: 'menu-icon' }, '🔌') },
  { label: '工具箱', key: 'toolbox', icon: () => h('span', { class: 'menu-icon' }, '🧰') },
  { label: '曲线拟合', key: 'curve-fit', icon: () => h('span', { class: 'menu-icon' }, '📈') },
  { label: '设置', key: 'settings', icon: () => h('span', { class: 'menu-icon' }, '⚙') }
]

function handleNav(key: string) {
  if (key === 'dashboard') router.push('/')
  else if (key === 'stats') router.push('/stats')
  else if (key === 'tutorials') router.push('/tutorials')
  else if (key === 'serial') router.push('/serial')
  else if (key === 'toolbox') router.push('/toolbox')
  else if (key === 'curve-fit') router.push('/curve-fit')
  else if (key === 'settings') router.push('/settings')
}

function openPalette() {
  paletteRef.value?.open?.()
}

function handleGlobalKey(e: KeyboardEvent) {
  // Ctrl+Shift+P / Cmd+Shift+P: command palette
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    openPalette()
    return
  }
  // F1: also open palette
  if (e.key === 'F1') {
    e.preventDefault()
    openPalette()
    return
  }
  // ? (Shift+/): show shortcuts help — only when not typing in an input
  if (e.key === '?' && !isEditable(e.target)) {
    e.preventDefault()
    showHelp.value = true
    return
  }
  // g then d/s/t/e: jump nav (vim-style)
  // skip for now — keep simple
}

function isEditable(t: EventTarget | null) {
  if (!t) return false
  const el = t as HTMLElement
  const tag = (el.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || el.isContentEditable
}

onMounted(async () => {
  await settingsStore.load()
  await projectsStore.load()
  window.addEventListener('keydown', handleGlobalKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKey)
})
</script>

<style>
.app-layout {
  display: flex;
  height: 100vh;
  background: var(--bg-app);
  color: var(--text);
}
.side {
  width: 208px;
  background: var(--bg-side);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 0;
  flex-shrink: 0;
}
.brand {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.brand:hover { background: rgba(255,255,255,.025); }
.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent) 0%, #1e40af 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(59,130,246,.35);
}
.brand-dot {
  width: 10px;
  height: 10px;
  background: white;
  border-radius: 3px;
  opacity: 0.95;
}
.logo {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: var(--text-strong);
  line-height: 1;
}
.logo-sub {
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 4px;
  margin-top: 3px;
  text-transform: uppercase;
}
.side-menu {
  padding: 0 10px;
}
.side-menu :deep(.n-menu-item) {
  height: 38px;
  margin: 2px 0;
}
.side-menu :deep(.n-menu-item-content) {
  font-size: 13px;
  font-weight: 500;
}
.menu-icon {
  font-size: 14px;
  display: inline-block;
  width: 18px;
  text-align: center;
}
.main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.side-footer {
  margin-top: auto;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--border);
}
.kbd-btn {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 11.5px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 0.15s;
}
.kbd-btn:hover {
  border-color: var(--accent);
  color: var(--accent-hover);
  background: rgba(59,130,246,.08);
}
.kbd-btn.subtle {
  background: transparent;
  border-color: transparent;
  color: var(--text-muted);
}
.kbd-btn.subtle:hover {
  color: var(--text-strong);
  border-color: var(--border);
  background: var(--bg-panel);
}
.version {
  text-align: center;
  color: var(--text-dim);
  font-size: 10.5px;
  margin-top: 4px;
  letter-spacing: 0.5px;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
