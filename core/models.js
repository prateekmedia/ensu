/**
 * Model Service
 * Handles model discovery, availability checking.
 */

import { getProvider } from '../providers/index.js';
import { MODELS, listRegisteredModels, getProviderConfig } from './config.js';

/**
 * Model Service
 * Manages model discovery and availability.
 */
export class ModelService {
  constructor() {
    this.availabilityCache = new Map();
    this.cacheTimeout = 60000; // 1 minute
  }

  /**
   * Get all registered models with availability status
   */
  async getModels(options = {}) {
    const { provider, checkAvailability = true } = options;
    
    let models = listRegisteredModels();
    
    if (provider) {
      models = models.filter(m => m.provider === provider);
    }

    if (!checkAvailability) {
      return models;
    }

    // Check which models are actually available
    const availableIds = await this.getAvailableModelIds(provider);
    
    return models.map(m => ({
      ...m,
      available: availableIds.includes(m.id),
    }));
  }

  /**
   * Get IDs of models that are actually available/installed
   */
  async getAvailableModelIds(providerName = 'local') {
    const cacheKey = `available:${providerName}`;
    const cached = this.availabilityCache.get(cacheKey);
    
    if (cached && Date.now() - cached.time < this.cacheTimeout) {
      return cached.ids;
    }

    try {
      const provider = getProvider(providerName, getProviderConfig(providerName));
      const result = await provider.listModels();
      
      if (result.ok) {
        this.availabilityCache.set(cacheKey, {
          ids: result.models,
          time: Date.now(),
        });
        return result.models;
      }
    } catch (e) {
      console.error(`Failed to get available models from ${providerName}:`, e);
    }

    return [];
  }

  /**
   * Check if a specific model is available
   */
  async isModelAvailable(modelId, providerName = 'local') {
    const available = await this.getAvailableModelIds(providerName);
    return available.includes(modelId);
  }

  /**
   * Get combined list: registered + any extra models from provider
   */
  async getAllModels(providerName = 'local') {
    const registered = listRegisteredModels().filter(m => m.provider === providerName);
    const available = await this.getAvailableModelIds(providerName);
    
    const registeredIds = new Set(registered.map(m => m.id));
    
    // Add any models from provider that aren't in our registry
    const extraModels = available
      .filter(id => !registeredIds.has(id))
      .map(id => ({
        id,
        name: id,
        provider: providerName,
        parameters: 'unknown',
        description: 'Model from provider (not in registry)',
        available: true,
      }));

    const registeredWithAvailability = registered.map(m => ({
      ...m,
      available: available.includes(m.id),
    }));

    return [...registeredWithAvailability, ...extraModels];
  }

  /**
   * Clear availability cache
   */
  clearCache() {
    this.availabilityCache.clear();
  }
}

// Singleton
let modelServiceInstance = null;

export function getModelService() {
  if (!modelServiceInstance) {
    modelServiceInstance = new ModelService();
  }
  return modelServiceInstance;
}
