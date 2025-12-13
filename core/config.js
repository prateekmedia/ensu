/**
 * Core Configuration
 * Loads from webgui.config.js and provides helper functions.
 */

import { createRequire } from 'module';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load config - try local override first, then default
let userConfig = {};
try {
  const localConfigPath = join(rootDir, 'webgui.config.local.js');
  const defaultConfigPath = join(rootDir, 'webgui.config.js');
  
  if (existsSync(localConfigPath)) {
    userConfig = (await import(localConfigPath)).default;
  } else if (existsSync(defaultConfigPath)) {
    userConfig = (await import(defaultConfigPath)).default;
  }
} catch (e) {
  console.warn('Failed to load config:', e.message);
}

// Merge with defaults
const defaultConfig = {
  build: { provider: 'local', outDir: 'dist' },
  providers: {},
  defaults: {
    provider: 'local',
    model: null,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful, friendly assistant.',
  },
  ui: {
    title: 'Ente LLM',
    contextWarningThreshold: 0.8,
  }
};

export const CONFIG = {
  ...defaultConfig,
  ...userConfig,
  providers: { ...defaultConfig.providers, ...userConfig.providers },
  defaults: { ...defaultConfig.defaults, ...userConfig.defaults },
  ui: { ...defaultConfig.ui, ...userConfig.ui },
};

// ─────────────────────────────────────────────────────────────
// Exports for backwards compatibility
// ─────────────────────────────────────────────────────────────

export const DEFAULTS = CONFIG.defaults;

export const PROVIDER_CONFIGS = Object.fromEntries(
  Object.entries(CONFIG.providers)
    .filter(([_, v]) => v.enabled)
    .map(([k, v]) => [k, { host: v.host }])
);

// Build MODELS registry from provider configs
export const MODELS = {};
for (const [providerName, provider] of Object.entries(CONFIG.providers)) {
  if (!provider.enabled || !provider.models) continue;
  for (const model of provider.models) {
    MODELS[model.id] = {
      ...model,
      provider: providerName,
    };
  }
}

/**
 * Get model info by ID
 */
export function getModelInfo(modelId) {
  return MODELS[modelId] || null;
}

/**
 * List all registered models
 */
export function listRegisteredModels() {
  return Object.values(MODELS);
}

/**
 * List models by provider
 */
export function listModelsByProvider(provider) {
  return Object.values(MODELS).filter(m => m.provider === provider);
}

/**
 * Get provider config
 */
export function getProviderConfig(provider) {
  return CONFIG.providers[provider] || {};
}

/**
 * Get enabled providers
 */
export function getEnabledProviders() {
  return Object.entries(CONFIG.providers)
    .filter(([_, v]) => v.enabled)
    .map(([k]) => k);
}

/**
 * Get context limit for a model
 */
export function getModelContextLimit(modelId) {
  const model = MODELS[modelId];
  return model?.context || 4096;
}
