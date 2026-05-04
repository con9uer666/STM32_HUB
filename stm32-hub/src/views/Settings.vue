<template>
  <div class="settings scroll-y" v-if="s">
    <header class="s-hdr">
      <h2>设置</h2>
      <n-button size="small" @click="autoDetect">🔍 自动探测工具路径</n-button>
    </header>

    <section class="s-block">
      <h3>工具路径</h3>
      <ToolPathField label="Keil UV4.exe" :value="s.toolPaths.keil" @change="v => set('toolPaths.keil', v)" hint="UV4.exe 是 Keil 主程序，默认位于 Keil 安装目录下的 UV4 文件夹" />
      <ToolPathField label="STM32CubeMX.exe" :value="s.toolPaths.cubemx" @change="v => set('toolPaths.cubemx', v)" />
      <ToolPathField label="VSCode (code.cmd)" :value="s.toolPaths.vscode" @change="v => set('toolPaths.vscode', v)" />
      <ToolPathField label="CMake" :value="s.toolPaths.cmake" @change="v => set('toolPaths.cmake', v)" />
      <ToolPathField label="Ninja (可选)" :value="s.toolPaths.ninja" @change="v => set('toolPaths.ninja', v)" />
    </section>

    <section class="s-block">
      <h3>DeepSeek AI</h3>
      <div class="field">
        <label>API Key</label>
        <n-input
          :value="s.aiKey"
          type="password"
          show-password-on="click"
          placeholder="sk-..."
          @update:value="v => set('aiKey', v)"
        />
      </div>
      <div class="field">
        <label>模型</label>
        <n-input :value="s.aiModel" @update:value="v => set('aiModel', v)" placeholder="deepseek-chat" />
      </div>
      <div class="field">
        <label>Endpoint</label>
        <n-input :value="s.aiEndpoint" @update:value="v => set('aiEndpoint', v)" placeholder="https://api.deepseek.com/chat/completions" />
      </div>
      <p class="tip">DeepSeek 兼容 OpenAI 格式。你也可以把 endpoint/model 换成 OpenAI、通义千问等其他兼容服务。</p>
    </section>

    <section class="s-block">
      <h3>GitHub 认证</h3>
      <n-radio-group :value="s.githubAuthMode" @update:value="v => set('githubAuthMode', v)">
        <n-radio value="local">本地 git 凭证（推荐）</n-radio>
        <n-radio value="pat">Personal Access Token（可拉取元数据）</n-radio>
      </n-radio-group>
      <div v-if="s.githubAuthMode === 'pat'" class="field" style="margin-top: 12px">
        <label>GitHub PAT</label>
        <n-input
          :value="s.githubPat"
          type="password"
          show-password-on="click"
          placeholder="ghp_..."
          @update:value="v => set('githubPat', v)"
        />
        <p class="tip">仅用于只读元数据（stars/issues/languages）。推送仍走本地 git 凭证。</p>
      </div>
      <div class="field" style="margin-top: 12px">
        <label>GitHub API 代理/镜像</label>
        <n-input
          :value="(s as any).githubProxy"
          placeholder="留空使用 api.github.com，国内可填 https://ghproxy.com/https://api.github.com"
          @update:value="v => set('githubProxy', v)"
        />
        <p class="tip">用于教程在线更新。如果直连 GitHub 不稳定，可配置代理地址。</p>
      </div>
    </section>

    <section class="s-block">
      <h3>扫描</h3>
      <div class="field">
        <label>默认递归深度</label>
        <n-input-number :value="s.scanDepth" :min="1" :max="8" @update:value="v => set('scanDepth', v ?? 3)" />
      </div>
    </section>

    <footer class="s-footer">
      <span class="muted">配置存储于本地 electron-store 配置文件。</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import {
  NInput, NInputNumber, NButton, NRadio, NRadioGroup, useMessage
} from 'naive-ui'
import { useSettingsStore } from '@/stores/settings'
import ToolPathField from '@/components/ToolPathField.vue'

const store = useSettingsStore()
const msg = useMessage()
const s = computed(() => store.settings)

async function set(key: string, value: unknown) {
  await store.set(key, value)
}

async function autoDetect() {
  const loader = msg.loading('探测中…', { duration: 0 })
  try {
    const r = await store.detectTools()
    loader.destroy()
    const found = Object.entries(r.detected).filter(([, v]) => !!v).map(([k]) => k).join(', ')
    msg.success(found ? `探测到：${found}` : '未探测到任何工具')
  } catch (e: any) {
    loader.destroy()
    msg.error(e?.message ?? String(e))
  }
}

onMounted(async () => {
  if (!store.settings) await store.load()
})
</script>

<style scoped>
.settings { padding: 24px 28px 40px; max-width: 860px; }
.s-hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.s-hdr h2 { margin: 0; font-weight: 650; font-size: 22px; color: var(--text-strong); letter-spacing: -0.01em; }
.s-block {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 18px 22px;
  margin-bottom: 14px;
}
.s-block h3 { margin: 0 0 14px; font-size: 13.5px; font-weight: 600; color: var(--text-strong); letter-spacing: 0.01em; }
.field { margin-bottom: 14px; }
.field label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 5px;
}
.tip { color: var(--text-muted); font-size: 12px; margin: 6px 0 0; line-height: 1.5; }
.s-footer { padding: 16px 0 30px; }
.muted { color: var(--text-dim); font-size: 12px; }
</style>
