/**
 * Web Interface Server
 * Thin HTTP layer that delegates to Core API.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';

import { CoreAPI, DEFAULTS, CONFIG } from '../../core/index.js';
import * as storage from '../../core/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const MAX_REQUEST_SIZE = '2mb';

/**
 * Sanitize error messages to prevent information leakage
 */
function sanitizeError(error) {
  if (process.env.NODE_ENV === 'development') {
    return String(error);
  }
  // In production, return generic message
  return 'An error occurred';
}

export function createWebServer(options = {}) {
  const app = express();
  const PORT = options.port || process.env.PORT || 3000;

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-eval' needed for WebLLM's dynamic code generation
        // 'wasm-unsafe-eval' needed for WebAssembly compilation
        // 'unsafe-inline' needed for marked.js and inline event handlers
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "blob:", "cdn.jsdelivr.net", "unpkg.com", "esm.run"],
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net"],
        fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "http://127.0.0.1:*", "http://localhost:*", "https://huggingface.co", "https://*.huggingface.co", "https://*.hf.co", "https://hf.co", "https://esm.run", "https://cdn.jsdelivr.net", "https://raw.githubusercontent.com"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  app.use(express.json({ limit: MAX_REQUEST_SIZE }));

  // Serve static UI
  app.use('/', express.static(path.join(__dirname, 'public')));
  
  // Handle client-side routing for /chat/:id
  app.get('/chat/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ─────────────────────────────────────────────────────────────
  // Config endpoint
  // ─────────────────────────────────────────────────────────────

  app.get('/api/config', (req, res) => {
    // Send client-safe config (no secrets)
    res.json({
      ok: true,
      defaults: CONFIG.defaults,
      ui: CONFIG.ui,
      providers: Object.fromEntries(
        Object.entries(CONFIG.providers)
          .filter(([_, v]) => v.enabled)
          .map(([k, v]) => [k, {
            models: v.models,
            // Include Local LLM-specific config
            ...(k === 'local' ? { useIndexedDBCache: v.useIndexedDBCache ?? true } : {})
          }])
      ),
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Local LLM Info (local runs the actual inference)
  // ─────────────────────────────────────────────────────────────

  app.get('/api/local/info', (req, res) => {
    const localConfig = CONFIG.providers?.local;
    if (!localConfig?.enabled) {
      return res.json({ ok: false, error: 'Local LLM provider not enabled' });
    }

    res.json({
      ok: true,
      enabled: true,
      useIndexedDBCache: localConfig.useIndexedDBCache ?? true,
      models: localConfig.models || [],
      note: 'Local LLM runs entirely in local. Use /local-client.js for inference.',
      docs: 'https://local.mlc.ai/',
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Provider endpoints
  // ─────────────────────────────────────────────────────────────

  app.get('/api/providers', (req, res) => {
    res.json({
      ok: true,
      providers: CoreAPI.listProviders(),
      default: DEFAULTS.provider,
    });
  });

  app.get('/api/health', async (req, res) => {
    const provider = req.query.provider || DEFAULTS.provider;
    
    try {
      const result = await CoreAPI.checkProviderHealth(provider);
      res.status(result.ok ? 200 : 502).json({
        provider,
        ...result,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e) });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Model endpoints
  // ─────────────────────────────────────────────────────────────

  app.get('/api/models', async (req, res) => {
    const provider = req.query.provider || DEFAULTS.provider;

    try {
      const models = await CoreAPI.getModels(provider);
      res.json({
        ok: true,
        provider,
        models: models.map(m => ({
          id: m.id,
          name: m.name,
          parameters: m.parameters,
          available: m.available,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, models: [], error: sanitizeError(e) });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Chat endpoints
  // ─────────────────────────────────────────────────────────────

  app.post('/api/chat', async (req, res) => {
    const {
      model,
      messages,
      stream = true,
      provider = DEFAULTS.provider,
      options = {},
    } = req.body || {};

    // Input validation
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing or invalid model' });
    }
    if (!Array.isArray(messages)) {
      return res.status(400).json({ ok: false, error: 'Missing messages[]' });
    }
    if (messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'Messages array cannot be empty' });
    }
    // Validate message structure
    for (const msg of messages) {
      if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
        return res.status(400).json({ ok: false, error: 'Invalid message role' });
      }
      if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
        return res.status(400).json({ ok: false, error: 'Invalid message content' });
      }
    }

    try {
      // Non-streaming
      if (!stream) {
        const result = await CoreAPI.quickChat(messages, { model, provider, ...options });
        if (!result.ok) {
          return res.status(502).json({ ok: false, error: result.error });
        }
        return res.json(result);
      }

      // Streaming
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      try {
        for await (const chunk of CoreAPI.quickChatStream(messages, { model, provider, ...options })) {
          res.write(JSON.stringify(chunk) + '\n');
        }
        res.end();
      } catch (streamError) {
        res.write(JSON.stringify({ ok: false, error: sanitizeError(streamError) }) + '\n');
        res.end();
      }

    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e) });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Persistent Sessions (stored to disk)
  // ─────────────────────────────────────────────────────────────

  // List all sessions
  app.get('/api/sessions', async (req, res) => {
    try {
      const sessions = await storage.listSessions();
      res.json({ ok: true, sessions });
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e) });
    }
  });

  // Get a session
  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ ok: false, error: 'Session not found' });
      }
      res.json({ ok: true, session });
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e) });
    }
  });

  // Create or update a session
  app.post('/api/sessions', async (req, res) => {
    try {
      const session = await storage.saveSession(req.body);
      res.json({ ok: true, session });
    } catch (e) {
      res.status(400).json({ ok: false, error: sanitizeError(e) });
    }
  });

  // Update a session
  app.put('/api/sessions/:id', async (req, res) => {
    try {
      const existing = await storage.getSession(req.params.id);
      if (!existing) {
        return res.status(404).json({ ok: false, error: 'Session not found' });
      }
      const session = await storage.saveSession({ ...existing, ...req.body, id: req.params.id });
      res.json({ ok: true, session });
    } catch (e) {
      res.status(400).json({ ok: false, error: sanitizeError(e) });
    }
  });

  // Delete a session
  app.delete('/api/sessions/:id', async (req, res) => {
    try {
      const deleted = await storage.deleteSession(req.params.id);
      res.json({ ok: true, deleted });
    } catch (e) {
      res.status(500).json({ ok: false, error: sanitizeError(e) });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Session-based chat (in-memory, optional)
  // ─────────────────────────────────────────────────────────────

  app.post('/api/sessions/memory', (req, res) => {
    const { model, provider } = req.body || {};
    
    try {
      const session = CoreAPI.createSession({ model, provider });
      res.json({
        ok: true,
        session: session.toJSON(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post('/api/sessions/:id/chat', async (req, res) => {
    const { id } = req.params;
    const { content, stream = true } = req.body || {};

    const session = CoreAPI.getSession(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!content) {
      return res.status(400).json({ error: 'Missing content' });
    }

    try {
      if (!stream) {
        const result = await CoreAPI.sendMessage(session, content);
        return res.json(result);
      }

      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of CoreAPI.sendMessageStream(session, content)) {
        res.write(JSON.stringify(chunk) + '\n');
      }
      res.end();

    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Start server
  // ─────────────────────────────────────────────────────────────

  function start() {
    return new Promise((resolve) => {
      const server = app.listen(PORT, () => {
        console.log(`Web GUI running on http://localhost:${PORT}`);
        console.log(`Default provider: ${DEFAULTS.provider}`);
        console.log(`Default model: ${DEFAULTS.model}`);
        resolve(server);
      });
    });
  }

  return { app, start };
}

// Direct execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createWebServer();
  server.start();
}
