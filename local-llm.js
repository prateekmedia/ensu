/**
 * Local LLM Client - Browser-side wrapper
 * Handles model loading, caching, and inference directly in browser.
 */

class LocalLLMClient {
  constructor() {
    this.mlc = null;
    this.engine = null;
    this.loadingEngine = null; // Engine being loaded (for cancellation)
    this.currentModel = null;
    this.loadProgress = { progress: 0, text: '', phase: 'idle' };
    this.config = null;
    this.useIndexedDB = true;
    this.isLoading = false;
    this.loadCancelled = false;
    this.currentStreamAborted = false;
  }

  /**
   * Initialize MLC module
   */
  async init() {
    if (this.mlc) return;
    
    console.log('[LocalLLM] Loading module...');
    // Use jsdelivr with pinned version for reliability
    // esm.run redirects here anyway, but direct is faster
    this.mlc = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm');
    console.log('[LocalLLM] Module ready');
  }

  /**
   * Set configuration from server config
   */
  setConfig(config) {
    this.config = config;
    this.useIndexedDB = config?.useIndexedDBCache ?? true;
  }

  /**
   * Check WebGPU support
   */
  async checkSupport() {
    if (!navigator.gpu) {
      return { supported: false, reason: 'WebGPU not available in this browser' };
    }
    
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return { supported: false, reason: 'No WebGPU adapter found' };
      }
      
      const info = await adapter.requestAdapterInfo?.() || {};
      const device = await adapter.requestDevice();
      
      return {
        supported: true,
        gpu: {
          vendor: info.vendor || 'unknown',
          architecture: info.architecture || 'unknown',
          device: info.device || 'unknown',
        },
        limits: {
          maxBufferSize: device.limits.maxBufferSize,
          maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
        }
      };
    } catch (e) {
      return { supported: false, reason: e.message };
    }
  }

  /**
   * Get storage info
   */
  async getStorageInfo() {
    if (!navigator.storage?.estimate) {
      return null;
    }
    
    const estimate = await navigator.storage.estimate();
    const persistent = await navigator.storage?.persisted?.() || false;
    
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
      available: (estimate.quota || 0) - (estimate.usage || 0),
      persistent,
      usedGB: ((estimate.usage || 0) / 1e9).toFixed(2),
      quotaGB: ((estimate.quota || 0) / 1e9).toFixed(2),
    };
  }

  /**
   * Request persistent storage
   */
  async requestPersistence() {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist();
  }

  /**
   * Check if model is cached
   */
  async isModelCached(modelId) {
    await this.init();
    try {
      return await this.mlc.hasModelInCache(modelId);
    } catch {
      return false;
    }
  }

  /**
   * Get cache status for configured models
   */
  async getCacheStatus() {
    await this.init();
    const models = this.config?.models || [];
    const results = [];
    
    for (const model of models) {
      const cached = await this.isModelCached(model.id);
      results.push({ ...model, cached });
    }
    
    return results;
  }

  /**
   * Delete model from cache
   */
  async deleteModel(modelId) {
    await this.init();
    try {
      await this.mlc.deleteModelAllInfoInCache(modelId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Clear all cached models
   */
  async clearCache() {
    await this.init();
    const models = this.config?.models || [];
    
    for (const model of models) {
      try {
        await this.mlc.deleteModelAllInfoInCache(model.id);
      } catch (e) {
        console.warn(`[LocalLLM] Failed to delete ${model.id}:`, e);
      }
    }
  }

  /**
   * Get default model library URL for a model
   */
  getDefaultModelLib(modelId) {
    // Model library URLs follow a pattern based on model ID
    const modelVersion = 'v0_2_80'; // Current MLC version
    const baseUrl = 'https://raw.githubusercontent.com/ArtifactsMMO/node_modules/main/@mlc-ai/web-llm-models/';
    
    // Extract base name for wasm file (remove -MLC suffix, add context info)
    const baseName = modelId.replace(/-MLC$/, '');
    return `${baseUrl}${modelVersion}/${baseName}-ctx4k_cs1k-webgpu.wasm`;
  }

  /**
   * Cancel ongoing model load
   * This now properly aborts in-flight downloads by calling unload() on the engine
   * which triggers the internal reloadController.abort()
   */
  async cancelLoad() {
    this.loadCancelled = true;
    
    // If we have a loading engine, unload() will abort the reloadController
    // which cancels in-flight fetch requests
    if (this.loadingEngine) {
      try {
        console.log('[LocalLLM] Aborting model load...');
        await this.loadingEngine.unload();
      } catch (e) {
        // AbortError is expected when cancelling
        if (e.name !== 'AbortError') {
          console.warn('[LocalLLM] Error unloading during cancel:', e);
        }
      }
      this.loadingEngine = null;
    }
    
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch (e) {
        console.warn('[LocalLLM] Error unloading engine:', e);
      }
      this.engine = null;
      this.currentModel = null;
    }
    
    this.isLoading = false;
    this.loadProgress = { progress: 0, text: 'Cancelled', phase: 'idle' };
  }

  /**
   * Set additional custom models (from user settings)
   */
  setCustomModels(models) {
    this.customModels = models || [];
  }

  /**
   * Get chat options for specific models that need template fixes
   * Ministral models need corrected conversation template
   */
  getChatOptionsForModel(modelId) {
    // Ministral models use mistral_default template which has issues
    // Override with correct Mistral instruct format
    if (modelId.toLowerCase().includes('ministral')) {
      return {
        temperature: 0.5,  // Lower temp for more coherent output
        repetition_penalty: 1.1,  // Help prevent repetition
        conv_template: {
          name: 'mistral_instruct',
          system_template: '[INST] {system_message}\n',
          system_message: 'You are a helpful assistant. Always respond in English unless asked otherwise.',
          system_prefix_token_ids: [1],
          add_role_after_system_message: false,
          roles: {
            user: '[INST]',
            assistant: '[/INST]',
            tool: '[INST]'
          },
          role_templates: {
            user: '{user_message}',
            assistant: '{assistant_message}',
            tool: '{tool_message}'
          },
          seps: ['</s>'],
          role_content_sep: ' ',
          role_empty_sep: '',
          stop_str: ['</s>'],
          stop_token_ids: [2]
        }
      };
    }
    return undefined;
  }

  /**
   * Load a model
   */
  async loadModel(modelId, onProgress) {
    await this.init();

    if (this.currentModel === modelId && this.engine) {
      return { alreadyLoaded: true };
    }

    // Cancel any previous load
    if (this.isLoading) {
      await this.cancelLoad();
    }

    // Unload previous model
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
      this.currentModel = null;
    }

    this.isLoading = true;
    this.loadCancelled = false;
    this.loadingEngine = null;
    this.loadProgress = { progress: 0, text: 'Initializing...', phase: 'init' };
    onProgress?.(this.loadProgress);

    // Build appConfig with prebuilt models + custom models from config + user custom models
    const allConfigModels = [
      ...(this.config?.models || []),
      ...(this.customModels || [])
    ];
    
    const customModels = allConfigModels
      .filter(m => m.modelUrl) // Only models with custom URLs
      .map(m => ({
        model: m.modelUrl,
        model_id: m.id,
        model_lib: m.modelLib || this.getDefaultModelLib(m.id),
        vram_required_MB: m.vramRequired,
        overrides: {
          context_window_size: m.context || 4096,
        }
      }));
    
    const appConfig = {
      useIndexedDBCache: this.useIndexedDB,
      model_list: [
        ...this.mlc.prebuiltAppConfig.model_list,
        ...customModels,
      ],
    };

    try {
      // Use MLCEngine class directly instead of CreateMLCEngine
      // This allows us to call unload() during loading to abort via reloadController
      const engine = new this.mlc.MLCEngine({
        appConfig,
        initProgressCallback: (progress) => {
          // Check if cancelled
          if (this.loadCancelled) return;
          
          let phase = 'loading';
          const text = progress.text || '';
          
          if (text.toLowerCase().includes('fetch')) phase = 'downloading';
          else if (text.toLowerCase().includes('load')) phase = 'loading';
          else if (text.toLowerCase().includes('compil')) phase = 'compiling';
          else if (text.toLowerCase().includes('gpu')) phase = 'gpu';
          else if (progress.progress >= 1) phase = 'ready';
          
          this.loadProgress = {
            progress: progress.progress,
            text: progress.text,
            phase,
          };
          
          onProgress?.(this.loadProgress);
        }
      });
      
      // Store reference so cancelLoad() can abort it
      this.loadingEngine = engine;
      
      // Build chat options - fix conversation template for Ministral models
      const chatOpts = this.getChatOptionsForModel(modelId);
      
      // reload() uses internal reloadController that can be aborted via unload()
      await engine.reload(modelId, chatOpts);

      // Check if cancelled during load
      if (this.loadCancelled) {
        await engine.unload();
        this.loadingEngine = null;
        this.isLoading = false;
        throw new Error('Loading cancelled');
      }

      // Success - transfer to main engine reference
      this.engine = engine;
      this.loadingEngine = null;
      this.currentModel = modelId;
      this.isLoading = false;
      this.loadProgress = { progress: 1, text: 'Ready', phase: 'ready' };
      onProgress?.(this.loadProgress);
      
      return { loaded: true };
      
    } catch (e) {
      this.loadingEngine = null;
      this.isLoading = false;
      
      // AbortError means cancel was successful
      if (e.name === 'AbortError' || e.message?.includes('aborted') || e.message?.includes('Abort')) {
        this.loadProgress = { progress: 0, text: 'Cancelled', phase: 'idle' };
        onProgress?.(this.loadProgress);
        throw new Error('Loading cancelled');
      }
      
      this.loadProgress = { progress: 0, text: e.message, phase: 'error' };
      onProgress?.(this.loadProgress);
      throw e;
    }
  }

  

  /**
   * Chat with streaming using callback
   * Returns a promise that resolves when streaming is complete or aborted
   */
  async chatStream(messages, onChunk, options = {}) {
    if (!this.engine) {
      throw new Error('No model loaded');
    }

    this.currentStreamAborted = false;
    
    try {
      const stream = await this.engine.chat.completions.create({
        messages,
        temperature: options.temperature ?? 0.6,
        top_p: options.topP ?? 0.9,
        frequency_penalty: options.frequencyPenalty ?? 0.0,
        presence_penalty: options.presencePenalty ?? 0.0,
        repetition_penalty: options.repetitionPenalty ?? 1.0,
        max_tokens: options.maxTokens ?? 2048,
        stream: true,
      });

      
      // Don't break out of loop - let engine's interrupt mechanism work naturally
      // This ensures the lock is properly released
      for await (const chunk of stream) {
        // Only process if not aborted
        if (!this.currentStreamAborted) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            const shouldContinue = onChunk({ delta });
            if (shouldContinue === false) {
              this.currentStreamAborted = true;
              this.engine.interruptGenerate();
              // Don't break - let the loop finish naturally so lock is released
            }
          }
        }
      }

      onChunk({ done: true });
    } catch (e) {
      onChunk({ done: true, error: e.message });
    }
  }
  
  /**
   * Abort current stream
   */
  abortStream() {
    this.currentStreamAborted = true;
    if (this.engine) {
      this.engine.interruptGenerate();
    }
  }

  /**
   * Non-streaming chat
   */
  async chatComplete(messages, options = {}) {
    if (!this.engine) {
      throw new Error('No model loaded');
    }

    const response = await this.engine.chat.completions.create({
      messages,
      temperature: options.temperature ?? 0.6,
      top_p: options.topP ?? 0.9,
      frequency_penalty: options.frequencyPenalty ?? 0.0,
      presence_penalty: options.presencePenalty ?? 0.0,
      repetition_penalty: options.repetitionPenalty ?? 1.0,
      max_tokens: options.maxTokens ?? 2048,
      stream: false,
    });

    return {
      content: response.choices[0].message.content,
      usage: response.usage,
    };
  }

  /**
   * Unload current model
   */
  async unload() {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
      this.currentModel = null;
      this.loadProgress = { progress: 0, text: '', phase: 'idle' };
    }
  }

  /**
   * Reset chat (keep model loaded)
   */
  async resetChat() {
    if (this.engine) {
      await this.engine.resetChat();
    }
  }

  /**
   * Get runtime stats
   */
  async getStats() {
    if (!this.engine) return null;
    return this.engine.runtimeStatsText();
  }

  /**
   * Get load progress
   */
  getProgress() {
    return this.loadProgress;
  }

  /**
   * Check if model is loaded
   */
  isLoaded(modelId) {
    if (!modelId) return this.engine !== null;
    return this.engine !== null && this.currentModel === modelId;
  }
}

// Export singleton instance
window.localLLM = new LocalLLMClient();

export default window.localLLM;
