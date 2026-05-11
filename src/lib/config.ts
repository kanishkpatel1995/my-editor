import type { Config } from '../types'

export function loadConfig(): { config: Config | null; missing: string[] } {
  const env = (import.meta as ImportMeta).env as Record<string, string | undefined>
  const apiKey = env.VITE_OPENROUTER_API_KEY?.trim() || ''
  const missing: string[] = []
  if (!apiKey || apiKey === 'sk-or-v1-replace-me') missing.push('VITE_OPENROUTER_API_KEY')

  if (missing.length) return { config: null, missing }

  return {
    config: {
      apiKey,
      defaultModel: env.VITE_DEFAULT_MODEL || 'qwen/qwen3.5-flash-02-23',
      defaultImageModel: env.VITE_DEFAULT_IMAGE_MODEL || 'google/gemini-3.1-flash-image-preview',
      chatFolderPath: env.VITE_CHAT_FOLDER || '',
      modelListLimit: Number(env.VITE_MODEL_LIST_LIMIT) || 200,
      threadCostWarnUsd: Number(env.VITE_THREAD_COST_WARN_USD) || 1.0,
    },
    missing: [],
  }
}
