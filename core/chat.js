/**
 * Chat Service
 * Core business logic for chat operations.
 * Completely UI-agnostic.
 */

import { getProvider } from '../providers/index.js';
import { DEFAULTS, getModelInfo, getProviderConfig } from './config.js';

/**
 * Chat Session
 * Manages conversation state and interactions.
 */
export class ChatSession {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.model = options.model || DEFAULTS.model;
    this.provider = options.provider || DEFAULTS.provider;
    this.messages = options.messages || [];
    this.createdAt = options.createdAt || new Date();
    this.options = {
      temperature: options.temperature ?? DEFAULTS.temperature,
      maxTokens: options.maxTokens ?? DEFAULTS.maxTokens,
    };
  }

  /**
   * Add a message to the conversation
   */
  addMessage(role, content) {
    const message = { role, content, timestamp: new Date() };
    this.messages.push(message);
    return message;
  }

  /**
   * Get messages in provider-compatible format
   */
  getMessagesForProvider() {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  /**
   * Clear conversation history
   */
  clear() {
    this.messages = [];
  }

  /**
   * Export session state (for persistence)
   */
  toJSON() {
    return {
      id: this.id,
      model: this.model,
      provider: this.provider,
      messages: this.messages,
      createdAt: this.createdAt,
      options: this.options,
    };
  }

  /**
   * Create session from exported state
   */
  static fromJSON(data) {
    return new ChatSession({
      ...data,
      createdAt: new Date(data.createdAt),
    });
  }
}

/**
 * Chat Service
 * Handles chat operations, provider communication.
 */
export class ChatService {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Create a new chat session
   */
  createSession(options = {}) {
    const session = new ChatSession(options);
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get existing session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Send a message and get response (non-streaming)
   */
  async sendMessage(session, content) {
    if (typeof session === 'string') {
      session = this.getSession(session);
    }
    if (!session) throw new Error('Session not found');

    // Add user message
    session.addMessage('user', content);

    // Get provider
    const provider = getProvider(session.provider, getProviderConfig(session.provider));

    // Send to provider
    const result = await provider.chat({
      model: session.model,
      messages: session.getMessagesForProvider(),
      options: {
        temperature: session.options.temperature,
        num_predict: session.options.maxTokens,
      }
    });

    if (!result.ok) {
      throw new Error(result.error || 'Chat request failed');
    }

    // Add assistant message
    const assistantContent = result.message?.content || '';
    session.addMessage('assistant', assistantContent);

    return {
      ok: true,
      message: result.message,
      session: session.toJSON(),
    };
  }

  /**
   * Send a message and get streaming response
   * Returns an async generator yielding chunks.
   */
  async *sendMessageStream(session, content) {
    if (typeof session === 'string') {
      session = this.getSession(session);
    }
    if (!session) throw new Error('Session not found');

    // Add user message
    session.addMessage('user', content);

    // Get provider
    const provider = getProvider(session.provider, getProviderConfig(session.provider));

    // Send to provider
    const result = await provider.chatStream({
      model: session.model,
      messages: session.getMessagesForProvider(),
      options: {
        temperature: session.options.temperature,
        num_predict: session.options.maxTokens,
      }
    });

    if (!result.ok) {
      throw new Error(result.error || 'Chat stream request failed');
    }

    // Stream chunks
    let fullContent = '';
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
            // Handle Ollama format
            const delta = chunk?.message?.content || '';
            if (delta) {
              fullContent += delta;
              yield { delta, done: false };
            }
            if (chunk?.done) {
              yield { delta: '', done: true };
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Add complete assistant message
    session.addMessage('assistant', fullContent);
  }
}

// Singleton instance
let chatServiceInstance = null;

/**
 * Get the chat service instance
 */
export function getChatService() {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService();
  }
  return chatServiceInstance;
}
