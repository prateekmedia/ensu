/**
 * Provider Registry
 * Central place to register and retrieve providers.
 */

import { BaseProvider } from './base.js';

// Registry of available provider classes (server-side)
// Note: 'local' provider runs entirely client-side via WebGPU, no server component
// Note: 'remote' provider connects to OpenAI-compatible APIs (including local Ollama)
const providerClasses = {};

// Browser-only providers (handled client-side, not server-side)
const browserOnlyProviders = ['local', 'remote'];

// Active provider instances (singleton per type)
const providerInstances = new Map();

/**
 * Get or create a provider instance
 * @param {string} type - Provider type (e.g., 'local', 'remote')
 * @param {object} [config] - Provider config (only used on first creation)
 * @returns {BaseProvider}
 */
export function getProvider(type, config = {}) {
  // Browser-only providers don't have server-side implementations
  if (browserOnlyProviders.includes(type)) {
    return null;
  }
  
  if (providerInstances.has(type)) {
    return providerInstances.get(type);
  }

  const ProviderClass = providerClasses[type];
  if (!ProviderClass) {
    throw new Error(`Unknown provider type: ${type}. Available: ${Object.keys(providerClasses).join(', ')}`);
  }

  const instance = new ProviderClass(config);
  providerInstances.set(type, instance);
  return instance;
}

/**
 * Check if a provider is browser-only
 */
export function isBrowserOnlyProvider(type) {
  return browserOnlyProviders.includes(type);
}

/**
 * List all registered provider types
 * @returns {string[]}
 */
export function listProviderTypes() {
  return Object.keys(providerClasses);
}

/**
 * Register a custom provider class
 * @param {string} type
 * @param {typeof BaseProvider} providerClass
 */
export function registerProvider(type, providerClass) {
  providerClasses[type] = providerClass;
}

/**
 * Clear a provider instance (useful for reconfiguring)
 * @param {string} type
 */
export function clearProvider(type) {
  providerInstances.delete(type);
}

export { BaseProvider };
