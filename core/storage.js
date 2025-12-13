/**
 * Session Storage
 * Persists chat sessions to disk as JSON files.
 */

import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSIONS_DIR = join(__dirname, '..', 'data', 'sessions');

// Constants
const MAX_SESSION_SIZE = 1024 * 1024; // 1MB max session size
const MAX_MESSAGES = 1000; // Max messages per session
const MAX_NAME_LENGTH = 200;

/**
 * Sanitize session ID to prevent path traversal attacks
 * Only allows alphanumeric characters, hyphens, and underscores
 */
function sanitizeId(id) {
  if (!id || typeof id !== 'string') return null;
  // Only allow alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  // Limit length
  if (id.length > 100) return null;
  return id;
}

/**
 * Validate session data structure
 */
function validateSession(session) {
  if (!session || typeof session !== 'object') {
    return { valid: false, error: 'Session must be an object' };
  }
  
  // Check size
  const size = JSON.stringify(session).length;
  if (size > MAX_SESSION_SIZE) {
    return { valid: false, error: `Session too large (max ${MAX_SESSION_SIZE / 1024}KB)` };
  }
  
  // Validate messages if present
  if (session.messages) {
    if (!Array.isArray(session.messages)) {
      return { valid: false, error: 'Messages must be an array' };
    }
    if (session.messages.length > MAX_MESSAGES) {
      return { valid: false, error: `Too many messages (max ${MAX_MESSAGES})` };
    }
  }
  
  // Validate name if present
  if (session.name && typeof session.name === 'string' && session.name.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `Name too long (max ${MAX_NAME_LENGTH} chars)` };
  }
  
  return { valid: true };
}

// Ensure sessions directory exists
async function ensureDir() {
  try {
    await mkdir(SESSIONS_DIR, { recursive: true });
  } catch (e) {
    // Ignore if exists
  }
}

/**
 * List all sessions
 */
export async function listSessions() {
  await ensureDir();
  try {
    const files = await readdir(SESSIONS_DIR);
    const sessions = [];
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = await readFile(join(SESSIONS_DIR, file), 'utf-8');
        const session = JSON.parse(data);
        sessions.push({
          id: session.id,
          name: session.name,
          model: session.model,
          messageCount: session.messages?.length || 0,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        });
      } catch (e) {
        // Skip corrupted files
      }
    }
    
    // Sort by updatedAt desc
    sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return sessions;
  } catch (e) {
    return [];
  }
}

/**
 * Get a session by ID
 */
export async function getSession(id) {
  const safeId = sanitizeId(id);
  if (!safeId) return null;
  
  await ensureDir();
  try {
    const data = await readFile(join(SESSIONS_DIR, `${safeId}.json`), 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

/**
 * Save a session
 */
export async function saveSession(session) {
  // Validate session data
  const validation = validateSession(session);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  await ensureDir();
  
  // Generate or sanitize ID
  if (!session.id) {
    session.id = generateId();
  } else {
    const safeId = sanitizeId(session.id);
    if (!safeId) {
      throw new Error('Invalid session ID format');
    }
    session.id = safeId;
  }
  
  if (!session.createdAt) {
    session.createdAt = new Date().toISOString();
  }
  session.updatedAt = new Date().toISOString();
  
  await writeFile(
    join(SESSIONS_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    'utf-8'
  );
  return session;
}

/**
 * Delete a session
 */
export async function deleteSession(id) {
  const safeId = sanitizeId(id);
  if (!safeId) return false;
  
  await ensureDir();
  try {
    await unlink(join(SESSIONS_DIR, `${safeId}.json`));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Generate a unique session ID using crypto
 */
function generateId() {
  return crypto.randomUUID();
}

export default {
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  sanitizeId,
  validateSession,
};
