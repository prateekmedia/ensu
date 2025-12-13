/**
 * Base Provider Interface
 * All model providers must implement these methods.
 */
export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
  }

  /**
   * Check if the provider backend is reachable
   * @returns {Promise<{ok: boolean, info?: object, error?: string}>}
   */
  async healthCheck() {
    throw new Error('healthCheck() not implemented');
  }

  /**
   * List available models
   * @returns {Promise<{ok: boolean, models: string[], error?: string}>}
   */
  async listModels() {
    throw new Error('listModels() not implemented');
  }

  /**
   * Send a chat completion request (non-streaming)
   * @param {object} params
   * @param {string} params.model
   * @param {{role: string, content: string}[]} params.messages
   * @param {object} [params.options]
   * @returns {Promise<{ok: boolean, message?: {role: string, content: string}, error?: string}>}
   */
  async chat(params) {
    throw new Error('chat() not implemented');
  }

  /**
   * Send a chat completion request (streaming)
   * Returns a readable stream of NDJSON chunks.
   * Each chunk: { delta?: string, done?: boolean, error?: string }
   * @param {object} params
   * @param {string} params.model
   * @param {{role: string, content: string}[]} params.messages
   * @param {object} [params.options]
   * @returns {Promise<{ok: boolean, stream?: ReadableStream, error?: string}>}
   */
  async chatStream(params) {
    throw new Error('chatStream() not implemented');
  }
}
