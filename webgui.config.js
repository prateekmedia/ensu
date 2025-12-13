/**
 * WebGUI Configuration
 * 
 * Configure providers, models, and build settings here.
 * Copy this to webgui.config.local.js for local overrides (gitignored).
 */

export default {
  // ─────────────────────────────────────────────────────────────
  // Build Configuration
  // ─────────────────────────────────────────────────────────────
  build: {
    // Which provider to bundle for production
    // Options: 'local', 'remote', 'all'
    provider: 'local',
    
    // Output directory for production build
    outDir: 'dist',
  },

  // ─────────────────────────────────────────────────────────────
  // Provider Configuration
  // ─────────────────────────────────────────────────────────────
  providers: {
    remote: {
      enabled: true,  // Shows in picker, requires API key via settings
      baseUrl: 'https://api.example.com/v1',
      models: []  // User adds models via settings
    },

    local: {
      enabled: true,
      useIndexedDBCache: true,
      
      // Local models run in browser via WebGPU
      // Find more MLC-compatible models: https://huggingface.co/mlc-ai
      models: [
        {
          id: 'Ministral-3B',
          name: 'Ministral 3B',
          parameters: '3B',
          context: 131072, // 128K context (model supports 256K but limited for VRAM)
          vramRequired: 2000,
          vision: false,
          // Custom model from HuggingFace - needs modelUrl & modelLib
          modelUrl: 'https://huggingface.co/willopcbeta/Ministral-3-3B-Instruct-2512-Llamafied-TextOnly-q4f16_1-MLC',
          modelLib: 'https://huggingface.co/willopcbeta/Ministral-3-3B-Instruct-2512-Llamafied-TextOnly-q4f16_1-MLC/resolve/main/Ministral-3-3B-Instruct-2512-Llamafied-TextOnly-q4f16_1-cs1k-webgpu.wasm',
          description: 'Mistral Ministral 3B - runs locally'
        },
        {
          id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
          name: 'Llama 3.2 1B',
          parameters: '1B',
          context: 4096,
          vramRequired: 879,
          vision: false,
          description: 'Meta Llama 3.2 1B - small, runs locally'
        },
      ]
    },
  },

  // ─────────────────────────────────────────────────────────────
  // Default Settings
  // ─────────────────────────────────────────────────────────────
  defaults: {
    provider: 'local',
    model: 'Ministral-3B',
    temperature: 0.7,        // 0.3-0.5 for factual/code, 0.8-1.0 for creative
    topP: 0.9,               // Nucleus sampling (0.9-0.95 recommended)
    repetitionPenalty: 1.1,  // Helps prevent loops (1.1-1.15 for smaller models)
    maxTokens: 2048,
    systemPrompt: 'You are a helpful, friendly assistant. Always respond in English unless asked otherwise.',
  },

  // ─────────────────────────────────────────────────────────────
  // UI Configuration
  // ─────────────────────────────────────────────────────────────
  ui: {
    title: 'ensu',
    contextWarningThreshold: 0.8, // Show warning at 80% context
  }
};
