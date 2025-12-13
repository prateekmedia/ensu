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
          id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
          name: 'Llama 3.2 3B',
          parameters: '3B',
          context: 4096,
          vramRequired: 2264,
          vision: false,
          description: 'Meta Llama 3.2 3B - runs locally'
        },
        {
          id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
          name: 'SmolLM2 360M',
          parameters: '360M',
          context: 4096,
          vramRequired: 376,
          vision: false,
          description: 'HuggingFace SmolLM2 360M - tiny, fast, great for mobile'
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
    model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    mobileModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',  // Default for mobile devices
    temperature: 0.6,        // 0.3-0.5 for factual/code, 0.8-1.0 for creative
    topP: 0.9,               // Nucleus sampling (0.9-0.95 recommended)
    frequencyPenalty: 0.0,   // Penalize repeated tokens (-2.0 to 2.0)
    presencePenalty: 0.0,    // Penalize tokens already present (-2.0 to 2.0)
    repetitionPenalty: 1.0,  // MLC-specific repetition penalty (> 0)
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
