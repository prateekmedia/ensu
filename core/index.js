/**
 * Core Module
 * Main entry point for business logic.
 * This module is completely UI-agnostic.
 */

// Re-export everything
export * from './config.js';
export * from './chat.js';
export * from './models.js';

// Convenience imports
import { getChatService, ChatSession } from './chat.js';
import { getModelService } from './models.js';
import { getProvider, listProviderTypes } from '../providers/index.js';
import { DEFAULTS, getProviderConfig } from './config.js';

/**
 * Core API
 * High-level API for interfaces (web, cli, etc.)
 */
export const CoreAPI = {
  // ─────────────────────────────────────────────────────────────
  // Provider Operations
  // ─────────────────────────────────────────────────────────────
  
  /**
   * List available provider types
   */
  listProviders() {
    return listProviderTypes();
  },

  /**
   * Check provider health
   */
  async checkProviderHealth(providerName = DEFAULTS.provider) {
    const provider = getProvider(providerName, getProviderConfig(providerName));
    return provider.healthCheck();
  },

  // ─────────────────────────────────────────────────────────────
  // Model Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Get all models (registered + discovered)
   */
  async getModels(providerName = DEFAULTS.provider) {
    const modelService = getModelService();
    return modelService.getAllModels(providerName);
  },

  /**
   * Check if model is available
   */
  async isModelAvailable(modelId, providerName = DEFAULTS.provider) {
    const modelService = getModelService();
    return modelService.isModelAvailable(modelId, providerName);
  },

  // ─────────────────────────────────────────────────────────────
  // Chat Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a new chat session
   */
  createSession(options = {}) {
    const chatService = getChatService();
    return chatService.createSession({
      provider: DEFAULTS.provider,
      model: DEFAULTS.model,
      ...options,
    });
  },

  /**
   * Get existing session
   */
  getSession(sessionId) {
    const chatService = getChatService();
    return chatService.getSession(sessionId);
  },

  /**
   * Send message (non-streaming)
   */
  async sendMessage(sessionOrId, content) {
    const chatService = getChatService();
    return chatService.sendMessage(sessionOrId, content);
  },

  /**
   * Send message (streaming)
   * Returns async generator
   */
  sendMessageStream(sessionOrId, content) {
    const chatService = getChatService();
    return chatService.sendMessageStream(sessionOrId, content);
  },

  // ─────────────────────────────────────────────────────────────
  // Quick Chat (stateless convenience method)
  // ─────────────────────────────────────────────────────────────

  /**
   * Quick one-off chat without session management
   */
  async quickChat(messages, options = {}) {
    const providerName = options.provider || DEFAULTS.provider;
    const model = options.model || DEFAULTS.model;
    
    const provider = getProvider(providerName, getProviderConfig(providerName));
    
    // Check if model is a thinking model (qwen3)
    const isThinkingModel = model.includes('qwen3');
    
    return provider.chat({
      model,
      messages,
      options: {
        temperature: options.temperature ?? (isThinkingModel ? 0.7 : DEFAULTS.temperature),
        top_p: isThinkingModel ? 0.8 : undefined,
        top_k: isThinkingModel ? 20 : undefined,
        min_p: isThinkingModel ? 0 : undefined,
        num_ctx: isThinkingModel ? 32768 : 8192, // Larger context for thinking models
        num_predict: options.maxTokens ?? DEFAULTS.maxTokens,
      }
    });
  },

  /**
   * Quick streaming chat without session management
   */
  async *quickChatStream(messages, options = {}) {
    const providerName = options.provider || DEFAULTS.provider;
    const model = options.model || DEFAULTS.model;
    
    const provider = getProvider(providerName, getProviderConfig(providerName));
    
    // Check if model is a thinking model (qwen3)
    const isThinkingModel = model.includes('qwen3');
    
    const result = await provider.chatStream({
      model,
      messages,
      options: {
        temperature: options.temperature ?? (isThinkingModel ? 0.7 : DEFAULTS.temperature),
        top_p: isThinkingModel ? 0.8 : undefined,
        top_k: isThinkingModel ? 20 : undefined,
        min_p: isThinkingModel ? 0 : undefined,
        num_ctx: isThinkingModel ? 32768 : 8192, // Larger context for thinking models
        num_predict: options.maxTokens ?? DEFAULTS.maxTokens,
      }
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const chunk = JSON.parse(trimmed);
            const delta = chunk?.message?.content || '';
            const thinking = chunk?.message?.thinking || '';
            
            // Yield content if any
            if (delta) {
              yield { delta, done: false };
            }
            // Yield thinking indicator (for models like qwen3)
            else if (thinking) {
              yield { thinking, done: false };
            }
            
            if (chunk?.done) {
              yield { delta: '', done: true };
            }
          } catch {
            // Ignore
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};

export default CoreAPI;
