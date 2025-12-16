// ─────────────────────────────────────────────────────────────
// Editorial Chat - Frontend
// ─────────────────────────────────────────────────────────────

// DOM Elements
const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const modelBtn = document.getElementById('modelBtn');
const modelModal = document.getElementById('modelModal');
const modelModalBody = document.getElementById('modelModalBody');
const modelModalClose = document.getElementById('modelModalClose');
const sessionBtn = document.getElementById('sessionBtn');
const sessionModal = document.getElementById('sessionModal');
const sessionModalClose = document.getElementById('sessionModalClose');
const sessionList = document.getElementById('sessionList');
const newChatOption = document.getElementById('newChatOption');
const dateEl = document.getElementById('date');
const masthead = document.querySelector('.masthead');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');
const imageModal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');
const modalClose = document.getElementById('modalClose');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
const inputArea = document.querySelector('.input-area');
const contextWarning = document.getElementById('contextWarning');
const contextPercent = document.getElementById('contextPercent');
const newChatBtn = document.getElementById('newChatBtn');
const dismissWarning = document.getElementById('dismissWarning');
const logoTitle = document.getElementById('logoTitle');
const localBanner = document.getElementById('localBanner');
const localBannerText = document.getElementById('localBannerText');
const localBannerBar = document.getElementById('localBannerBar');
const localBannerCancel = document.getElementById('localBannerCancel');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsClose = document.getElementById('settingsClose');
const settingsSave = document.getElementById('settingsSave');
const localSettingsModal = document.getElementById('localSettingsModal');
const localSettingsClose = document.getElementById('localSettingsClose');
const localSettingsSave = document.getElementById('localSettingsSave');
const openaiKeyInput = document.getElementById('openaiKey');
const openaiUrlInput = document.getElementById('openaiUrl');
const apiTypeField = document.getElementById('apiTypeField');
const modelUrlField = document.getElementById('modelUrlField');
const modelUrlInput = document.getElementById('modelUrl');
const modelLibInput = document.getElementById('modelLib');
const modelVramInput = document.getElementById('modelVram');
const localModelContextInput = document.getElementById('localModelContext');
const modelApiTypeChat = document.getElementById('modelApiTypeChat');
const modelApiTypeResponses = document.getElementById('modelApiTypeResponses');


// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const MAX_INPUT_LENGTH = 32000; // Max characters per message (roughly 8K tokens)

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
let messages = [];
let currentModel = null;
let currentProvider = 'local';
let isStreaming = false;
let currentSessionId = null;
let currentSessionName = 'New Chat';
let abortController = null;
let pendingImages = []; // Base64 images to attach to next message
let hasCommittedToCompact = false; // Once scrolled, stay compact until new session
let contextUsage = { prompt: 0, total: 0 }; // Track token usage
let contextWarningDismissed = false; // User dismissed the warning

// Model context limits (loaded from config)
let MODEL_CONTEXT = { default: 4096 };
let APP_CONFIG = null;
let localLLM = null; // Local LLM client instance (lazy loaded)
let localModelCache = new Map(); // Track cached status

// ─────────────────────────────────────────────────────────────
// Embedded Config (for static deployment like GitHub Pages)
// ─────────────────────────────────────────────────────────────
const EMBEDDED_CONFIG = {
  ok: true,
  defaults: {
    provider: 'local',
    model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    mobileModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    temperature: 0.6,
    topP: 0.9,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    repetitionPenalty: 1.0,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful, friendly assistant.',
  },
  ui: {
    title: 'ensu',
    contextWarningThreshold: 0.8,
  },
  providers: {
    local: {
      useIndexedDBCache: true,
      models: [
        {
          id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
          name: 'Qwen 2.5 1.5B',
          parameters: '1.5B',
          context: 4096,
          vramRequired: 1100,
          vision: false,
          description: 'Alibaba Qwen 2.5 1.5B - balanced performance, runs locally'
        },
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
      ]
    },
    remote: {
      models: []
    }
  }
};

// ─────────────────────────────────────────────────────────────
// Markdown
// ─────────────────────────────────────────────────────────────
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });
}

function renderMarkdown(text) {
  if (!text) return '';
  try {
    if (typeof marked !== 'undefined' && marked.parse) {
      const html = marked.parse(text);
      // Sanitize to prevent XSS from model outputs
      if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html);
      }
      return html;
    }
  } catch (e) {
    console.error('Markdown parse error:', e);
  }
  // Fallback: escape HTML and preserve newlines
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ─────────────────────────────────────────────────────────────
// Image Handling
// ─────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      img.onload = () => {
        // Convert to JPEG using canvas (handles HEIC, WebP, etc.)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Limit size based on model (ministral supports larger images)
        // Larger context models can handle bigger images
        const modelContext = MODEL_CONTEXT[currentModel] || MODEL_CONTEXT.default;
        const maxSize = modelContext > 10000 ? 2500 : 1280;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export as JPEG with lower quality to reduce tokens
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, dataUrl });
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addPendingImage({ base64, dataUrl }) {
  pendingImages.push({ base64, dataUrl });
  renderImagePreview();
}

function removePendingImage(index) {
  pendingImages.splice(index, 1);
  renderImagePreview();
}

function clearPendingImages() {
  pendingImages = [];
  renderImagePreview();
}

function renderImagePreview() {
  imagePreview.innerHTML = '';
  pendingImages.forEach((img, i) => {
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    div.innerHTML = `
      <img src="${img.dataUrl}" alt="Preview">
      <button class="remove-btn" data-index="${i}">×</button>
    `;
    div.querySelector('.remove-btn').addEventListener('click', () => removePendingImage(i));
    imagePreview.appendChild(div);
  });
  
  // Disable attach button if image already attached (limit 1)
  if (pendingImages.length > 0) {
    uploadBtn.disabled = true;
    uploadBtn.style.opacity = '0.3';
  } else {
    uploadBtn.disabled = false;
    uploadBtn.style.opacity = '';
  }
  
  // Update button states when images change
  if (typeof updateButtonStates === 'function') {
    updateButtonStates();
  }
}

async function handleFileSelect(file) {
  if (!file) return;
  // Accept any image type - we'll convert to JPEG
  if (!file.type.startsWith('image/') && !file.name.match(/\.(heic|heif)$/i)) return;
  
  try {
    const result = await fileToBase64(file);
    addPendingImage(result);
  } catch (e) {
    console.error('Failed to process image:', e);
  }
}

// ─────────────────────────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────────────────────────
// Status is now shown in message area, this is a no-op for compatibility
function setStatus(text, isError = false, isWorking = false) {
  // No-op - status removed from app bar
}

function getTime() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

function updateDividers() {
  document.querySelectorAll('.divider').forEach(d => d.remove());
  const msgs = document.querySelectorAll('.message');
  msgs.forEach((el, i) => {
    const isReceived = el.classList.contains('received');
    const next = msgs[i + 1];
    if (next && isReceived && next.classList.contains('sent')) {
      el.insertAdjacentHTML('afterend', '<div class="divider"><span>✦</span></div>');
    }
  });
}

function clearWelcome() {
  const welcome = chatEl.querySelector('.welcome');
  if (welcome) welcome.remove();
}

function addMessage(role, content, images = [], animate = true) {
  clearWelcome();
  
  const isSent = role === 'user';
  const div = document.createElement('div');
  div.className = `message ${isSent ? 'sent' : 'received'}`;
  if (!animate) {
    div.style.animation = 'none';
    div.style.opacity = '1';
  }
  
  // Build HTML with optional images
  let imagesHtml = '';
  if (images && images.length > 0) {
    imagesHtml = `<div class="message-images">
      ${images.map(img => `<img src="${img.dataUrl || `data:image/jpeg;base64,${img.base64}`}" alt="Attached image">`).join('')}
    </div>`;
  }
  
  div.innerHTML = `
    ${imagesHtml}
    <div class="text"></div>
    <div class="message-footer">
      <span class="timestamp">${getTime()}</span>
      <button class="copy-btn" title="Copy">
        <i data-lucide="copy"></i>
      </button>
      ${!isSent ? `<button class="retry-btn" title="Retry">
        <i data-lucide="refresh-cw"></i>
      </button>` : ''}
    </div>
  `;
  
  // Setup copy button
  const copyBtn = div.querySelector('.copy-btn');
  copyBtn.addEventListener('click', async () => {
    const textEl = div.querySelector('.text');
    const textToCopy = textEl.innerText || textEl.textContent;
    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
      // Show feedback
      copyBtn.innerHTML = '<i data-lucide="check"></i>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      setTimeout(() => {
        copyBtn.innerHTML = '<i data-lucide="copy"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }, 1500);
    }
  });
  
  // Setup retry button (only for sent messages)
  const retryBtn = div.querySelector('.retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      retryLastMessage(div);
    });
  }
  
  // Render Lucide icon
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  const textEl = div.querySelector('.text');
  if (isSent) {
    // Escape HTML and convert newlines to <br> for sent messages
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    textEl.innerHTML = escaped.replace(/\n/g, '<br>');
  } else {
    textEl.innerHTML = renderMarkdown(content);
  }
  
  chatEl.appendChild(div);
  updateDividers();
  scrollToBottom(); // Only scrolls if user hasn't scrolled up
  
  return div;
}

let userHasScrolledUp = false;

function isNearBottom() {
  const threshold = 150; // pixels from bottom
  return (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - threshold);
}

function updateScrollButton() {
  if (isStreaming && userHasScrolledUp) {
    scrollToBottomBtn.classList.add('visible');
    scrollToBottomBtn.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } else {
    scrollToBottomBtn.classList.remove('visible');
    setTimeout(() => {
      if (!scrollToBottomBtn.classList.contains('visible')) {
        scrollToBottomBtn.style.display = 'none';
      }
    }, 200);
  }
}

function scrollToBottom() {
  if (!userHasScrolledUp) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
}

// Scroll to bottom button click handler
scrollToBottomBtn?.addEventListener('click', () => {
  userHasScrolledUp = false;
  updateScrollButton();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

// Detect user opposing scroll - wheel up or touch scroll up
window.addEventListener('wheel', (e) => {
  if (isStreaming && e.deltaY < 0) {
    // User is scrolling UP - they want to read previous content
    userHasScrolledUp = true;
    updateScrollButton();
  }
}, { passive: true });

window.addEventListener('touchstart', (e) => {
  if (isStreaming) {
    window._lastTouchY = e.touches[0].clientY;
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (isStreaming && window._lastTouchY !== undefined) {
    const currentY = e.touches[0].clientY;
    if (currentY > window._lastTouchY) {
      // Finger moving down = scrolling UP
      userHasScrolledUp = true;
      updateScrollButton();
    }
    window._lastTouchY = currentY;
  }
}, { passive: true });

function setStreamingMode(streaming) {
  if (streaming) {
    // Show stop button
    sendBtn.innerHTML = `<i data-lucide="square"></i>`;
    sendBtn.classList.add('stop');
  } else {
    // Show send button
    sendBtn.innerHTML = `<i data-lucide="send-horizontal"></i>`;
    sendBtn.classList.remove('stop');
  }
  // Re-render Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function resetChat() {
  // Stop any ongoing generation
  if (isStreaming && abortController) {
    abortController.abort();
  }
  
  messages = [];
  pendingImages = [];
  currentSessionId = null;
  currentSessionName = 'New Chat';
  contextUsage = { prompt: 0, total: 0 };
  contextWarningDismissed = false;
  hideContextWarning();
  renderImagePreview();
  updateUrlForSession(null);
  chatEl.innerHTML = `
    <div class="welcome">
      <p class="welcome-text">Select a model and begin your conversation.</p>
    </div>
  `;
  sessionBtn.textContent = 'New Chat';
  
  // Reset to non-compact mode and scroll to top
  window.scrollTo({ top: 0 });
  // Use timeout to ensure scroll completes before resetting
  setTimeout(() => {
    hasCommittedToCompact = false;
    masthead.classList.remove('compact');
    inputArea.classList.remove('floating');
  }, 50);
}

// ─────────────────────────────────────────────────────────────
// Context Warning
// ─────────────────────────────────────────────────────────────
function getModelContextLimit() {
  if (!currentModel) return MODEL_CONTEXT.default;
  return MODEL_CONTEXT[currentModel] || MODEL_CONTEXT.default;
}

function checkContextWarning() {
  if (contextWarningDismissed) return;
  
  const limit = getModelContextLimit();
  const usage = contextUsage.prompt; // Use prompt tokens as the context usage
  const percent = Math.round((usage / limit) * 100);
  
  console.log('[Context] Usage:', usage, '/', limit, '=', percent + '%');
  
  if (percent >= 80) {
    showContextWarning(percent);
  } else {
    hideContextWarning();
  }
}

function showContextWarning(percent) {
  contextPercent.textContent = percent;
  contextWarning.style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function hideContextWarning() {
  contextWarning.style.display = 'none';
}

// Wire up context warning buttons
newChatBtn?.addEventListener('click', () => {
  resetChat();
});

dismissWarning?.addEventListener('click', () => {
  contextWarningDismissed = true;
  hideContextWarning();
});



// ─────────────────────────────────────────────────────────────
// Modal Logic
// ─────────────────────────────────────────────────────────────
function openModal(modal) {
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

function setupPickers() {
  // Model button opens model modal
  modelBtn?.addEventListener('click', () => {
    openModal(modelModal);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
  
  // Session button opens session modal
  sessionBtn?.addEventListener('click', () => {
    loadSessions(); // Refresh session list
    openModal(sessionModal);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
  
  // Close buttons
  modelModalClose?.addEventListener('click', () => closeModal(modelModal));
  sessionModalClose?.addEventListener('click', () => closeModal(sessionModal));
  
  // Click outside to close
  modelModal?.addEventListener('click', (e) => {
    if (e.target === modelModal) closeModal(modelModal);
  });
  sessionModal?.addEventListener('click', (e) => {
    if (e.target === sessionModal) closeModal(sessionModal);
  });
  
  // New chat option
  newChatOption?.addEventListener('click', () => {
    resetChat();
    closeModal(sessionModal);
  });
}

// ─────────────────────────────────────────────────────────────
// Mobile keyboard handling
// ─────────────────────────────────────────────────────────────
function setupMobileKeyboardHandling() {
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) return;

  // Ensure input is scrolled into view on focus
  inputEl?.addEventListener('focus', () => {
    inputEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  // Use VisualViewport when available to lift the input bar above the keyboard
  const vv = window.visualViewport;
  if (!vv || !inputArea) return;

  const adjustForKeyboard = () => {
    const heightDiff = (window.innerHeight - vv.height - vv.offsetTop);
    if (heightDiff > 50) {
      inputArea.style.bottom = `${heightDiff + 8}px`;
      inputArea.classList.add('keyboard-open');
    } else {
      inputArea.style.bottom = '';
      inputArea.classList.remove('keyboard-open');
    }
  };

  vv.addEventListener('resize', adjustForKeyboard);
  vv.addEventListener('scroll', adjustForKeyboard);
  inputEl?.addEventListener('focus', adjustForKeyboard);
  inputEl?.addEventListener('blur', () => {
    inputArea.style.bottom = '';
    inputArea.classList.remove('keyboard-open');
  });
}

// ─────────────────────────────────────────────────────────────
// Storage Abstraction (can be swapped for other backends)
// ─────────────────────────────────────────────────────────────
const Storage = {
  // Storage backend - can be: 'local', 'server', 'indexeddb'
  backend: 'local',
  
  // LocalStorage implementation
  local: {
    KEY: 'chat_sessions',
    
    async list() {
      try {
        const data = JSON.parse(localStorage.getItem(this.KEY) || '{}');
        return Object.values(data).sort((a, b) => 
          new Date(b.updatedAt) - new Date(a.updatedAt)
        );
      } catch (e) {
        return [];
      }
    },
    
    async get(id) {
      try {
        const data = JSON.parse(localStorage.getItem(this.KEY) || '{}');
        return data[id] || null;
      } catch (e) {
        return null;
      }
    },
    
    async save(session) {
      try {
        const data = JSON.parse(localStorage.getItem(this.KEY) || '{}');
        if (!session.id) {
          session.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        }
        if (!session.createdAt) {
          session.createdAt = new Date().toISOString();
        }
        session.updatedAt = new Date().toISOString();
        data[session.id] = session;
        localStorage.setItem(this.KEY, JSON.stringify(data));
        return session;
      } catch (e) {
        console.error('Storage save error:', e);
        return null;
      }
    },
    
    async delete(id) {
      try {
        const data = JSON.parse(localStorage.getItem(this.KEY) || '{}');
        delete data[id];
        localStorage.setItem(this.KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    }
  },
  
  // Server-side implementation (for future use)
  server: {
    async list() {
      const r = await fetch('/api/sessions');
      const data = await r.json();
      return data.ok ? data.sessions : [];
    },
    
    async get(id) {
      const r = await fetch(`/api/sessions/${id}`);
      const data = await r.json();
      return data.ok ? data.session : null;
    },
    
    async save(session) {
      const r = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      });
      const data = await r.json();
      return data.ok ? data.session : null;
    },
    
    async delete(id) {
      const r = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      const data = await r.json();
      return data.ok;
    }
  },
  
  // Proxy methods to current backend
  list() { return this[this.backend].list(); },
  get(id) { return this[this.backend].get(id); },
  save(session) { return this[this.backend].save(session); },
  delete(id) { return this[this.backend].delete(id); }
};

// ─────────────────────────────────────────────────────────────
// Session Persistence
// ─────────────────────────────────────────────────────────────
async function loadSessions() {
  try {
    const sessions = await Storage.list();
    renderSessionList(sessions);
  } catch (e) {
    console.error('Failed to load sessions:', e);
  }
}

async function saveCurrentSession() {
  if (messages.length === 0) return;
  
  // Generate name from first message if not set
  if (!currentSessionId || currentSessionName === 'New Chat') {
    const firstMsg = messages.find(m => m.role === 'user');
    if (firstMsg) {
      currentSessionName = (firstMsg.content || 'Image chat').slice(0, 50);
    }
  }
  
  try {
    const session = await Storage.save({
      id: currentSessionId,
      name: currentSessionName,
      model: currentModel,
      provider: currentProvider,
      messages: messages
    });
    
    if (session) {
      const isNewSession = !currentSessionId;
      currentSessionId = session.id;
      sessionBtn.textContent = currentSessionName.slice(0, 20) + (currentSessionName.length > 20 ? '...' : '');
      if (isNewSession) {
        updateUrlForSession(session.id);
      }
      loadSessions(); // Refresh list
    }
  } catch (e) {
    console.error('Failed to save session:', e);
  }
}

async function loadSession(id) {
  // Stop any ongoing generation
  if (isStreaming && abortController) {
    abortController.abort();
  }
  
  try {
    const session = await Storage.get(id);
    if (!session) return false;
    if (session) {
      currentSessionId = session.id;
      currentSessionName = session.name;
      currentModel = session.model;
      currentProvider = session.provider || 'local';
      messages = session.messages || [];
      
      // Update UI
      sessionBtn.textContent = currentSessionName.slice(0, 20) + (currentSessionName.length > 20 ? '...' : '');
      const providerTags = { local: 'local', remote: 'remote' };
      const providerShort = providerTags[currentProvider] || currentProvider;
      const modelInfo = getModelInfo(currentModel, currentProvider);
      modelBtn.textContent = getModelDisplayName(modelInfo || { id: currentModel }) || 'Select Model';
      
      // Render messages
      chatEl.innerHTML = '';
      for (const msg of messages) {
        if (msg.role === 'user') {
          const imgs = msg.images ? msg.images.map(b64 => ({ base64: b64, dataUrl: `data:image/jpeg;base64,${b64}` })) : [];
          addMessage('user', msg.content, imgs, false);
        } else if (msg.role === 'assistant') {
          const div = addMessage('assistant', '', [], false);
          div.querySelector('.text').innerHTML = renderMarkdown(msg.content);
          div.classList.add('done');
        }
      }
      
      scrollToBottom(true);
      closeModal(sessionModal);
      updateUrlForSession(session.id);
      updateVisionSupport();
      // Ensure all Lucide icons are rendered after loading session
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return true;
    }
  } catch (e) {
    console.error('Failed to load session:', e);
    return false;
  }
}

async function deleteSession(id) {
  if (!confirm('Delete this session?')) return;
  
  try {
    await Storage.delete(id);
    if (id === currentSessionId) {
      resetChat();
    }
    loadSessions();
  } catch (e) {
    console.error('Failed to delete session:', e);
  }
}

function renderSessionList(sessions) {
  if (!sessionList) return;
  
  sessionList.innerHTML = '';
  
  if (sessions.length === 0) {
    sessionList.innerHTML = '<div class="picker-modal-hint">No saved chats</div>';
    return;
  }
  
  sessions.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'picker-modal-option' + (s.id === currentSessionId ? ' active' : '');
    
    // Format date/time
    const msgCount = s.messages?.length || s.messageCount || 0;
    const updatedAt = s.updatedAt ? new Date(s.updatedAt) : null;
    let timeStr = '';
    if (updatedAt) {
      const now = new Date();
      const diffDays = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        timeStr = updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      } else if (diffDays === 1) {
        timeStr = 'Yesterday';
      } else if (diffDays < 7) {
        timeStr = updatedAt.toLocaleDateString('en-US', { weekday: 'short' });
      } else {
        timeStr = updatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
    
    btn.innerHTML = `
      <div class="session-option">
        <div class="session-option-info">
          <span class="session-option-name">${s.name.slice(0, 35)}${s.name.length > 35 ? '...' : ''}</span>
          <span class="session-option-meta">${msgCount} msgs${timeStr ? ' · ' + timeStr : ''}</span>
        </div>
        <button class="session-option-delete" title="Delete">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    btn.addEventListener('click', (e) => {
      if (!e.target.closest('.session-option-delete')) {
        loadSession(s.id);
        closeModal(sessionModal);
      }
    });
    btn.querySelector('.session-option-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });
    sessionList.appendChild(btn);
  });
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─────────────────────────────────────────────────────────────
// Secure Storage (encrypted credentials)
// ─────────────────────────────────────────────────────────────

const SecureStorage = {
  // Encryption key derived from a device-specific fingerprint
  _key: null,
  
  async _getKey() {
    if (this._key) return this._key;
    
    // Get or create a device-specific salt
    let salt = localStorage.getItem('_secure_salt');
    if (!salt) {
      const saltArray = crypto.getRandomValues(new Uint8Array(16));
      salt = btoa(String.fromCharCode(...saltArray));
      localStorage.setItem('_secure_salt', salt);
    }
    
    // Derive key from salt + origin (makes it origin-bound)
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(salt + window.location.origin),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    this._key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('webgui_secure_v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    return this._key;
  },
  
  async encrypt(text) {
    if (!text) return '';
    try {
      const key = await this._getKey();
      const encoder = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(text)
      );
      // Combine IV + encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      return btoa(String.fromCharCode(...combined));
    } catch (e) {
      console.error('Encryption failed:', e);
      return '';
    }
  },
  
  async decrypt(encryptedBase64) {
    if (!encryptedBase64) return '';
    try {
      const key = await this._getKey();
      const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error('Decryption failed:', e);
      return '';
    }
  },
  
  async setCredential(key, value) {
    const encrypted = await this.encrypt(value);
    localStorage.setItem(`_sec_${key}`, encrypted);
  },
  
  async getCredential(key) {
    const encrypted = localStorage.getItem(`_sec_${key}`);
    return await this.decrypt(encrypted);
  },
  
  // Non-sensitive data (URLs, model configs)
  setData(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  
  getData(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }
};

// ─────────────────────────────────────────────────────────────
// Settings & API Keys
// ─────────────────────────────────────────────────────────────

// Cache for decrypted keys (in memory only)
let _apiKeyCache = {};

async function openSettings() {
  // Load saved settings (decrypt keys)
  openaiKeyInput.value = await SecureStorage.getCredential('remote_api_key') || '';
  openaiUrlInput.value = SecureStorage.getData('remote_base_url', '') || '';
  
  
  
  // Render model lists
  renderModelsList('remote');
  
  
  settingsModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openSettings = openSettings; // Expose globally for onclick

function closeSettings() {
  settingsModal.classList.remove('open');
  document.body.style.overflow = '';
}

async function saveSettings() {
  // Save credentials (encrypted)
  await SecureStorage.setCredential('remote_api_key', openaiKeyInput.value.trim());
  
  // Save URLs (not encrypted, not sensitive)
  SecureStorage.setData('remote_base_url', openaiUrlInput.value.trim());
  
  
  // Clear cache to force re-fetch
  _apiKeyCache = {};
  
  closeSettings();
  loadModels(); // Refresh models to show/hide based on API key availability
}

async function getApiKey(provider) {
  // Check cache first
  if (_apiKeyCache[provider] !== undefined) {
    return _apiKeyCache[provider];
  }
  // Decrypt and cache
  const key = await SecureStorage.getCredential(`${provider}_api_key`);
  _apiKeyCache[provider] = key || '';
  return _apiKeyCache[provider];
}

function getBaseUrl(provider) {
  const saved = SecureStorage.getData(`${provider}_base_url`, '');
  if (saved) return saved;
  
  // Defaults
  const defaults = {
    remote: 'https://api.example.com/v1',
    
  };
  return defaults[provider] || '';
}

async function hasApiKey(provider) {
  const key = await getApiKey(provider);
  return !!key;
}

// Toggle password visibility
document.querySelectorAll('.toggle-visibility').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (input) {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}"></i>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  });
});

// Settings event listeners
settingsBtn?.addEventListener('click', openSettings);
settingsClose?.addEventListener('click', closeSettings);

// Local settings event listeners
function openLocalSettings() {
  renderModelsList('local');
  localSettingsModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeLocalSettings() {
  localSettingsModal.classList.remove('open');
  document.body.style.overflow = '';
}

localSettingsClose?.addEventListener('click', closeLocalSettings);
localSettingsSave?.addEventListener('click', closeLocalSettings);
localSettingsModal?.addEventListener('click', (e) => {
  if (e.target === localSettingsModal) closeLocalSettings();
});

// API type toggle in Add Model modal
modelApiTypeChat?.addEventListener('click', () => {
  modelApiTypeChat.classList.add('active');
  modelApiTypeResponses.classList.remove('active');
});
modelApiTypeResponses?.addEventListener('click', () => {
  modelApiTypeResponses.classList.add('active');
  modelApiTypeChat.classList.remove('active');
});
settingsSave?.addEventListener('click', saveSettings);
settingsModal?.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});

// ─────────────────────────────────────────────────────────────
// Model Configuration
// ─────────────────────────────────────────────────────────────

const CUSTOM_MODELS_KEY = 'custom_models';

function getCustomModels() {
  return SecureStorage.getData(CUSTOM_MODELS_KEY, { remote: [] });
}

function saveCustomModels(models) {
  SecureStorage.setData(CUSTOM_MODELS_KEY, models);
}

function renderModelsList(provider) {
  const listEl = document.getElementById(`${provider}ModelsList`);
  if (!listEl) return;
  
  const customModels = getCustomModels();
  const models = customModels[provider] || [];
  
  listEl.innerHTML = '';
  
  if (models.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'models-list-empty';
    hint.innerHTML = `<span>No models. Click <strong>+</strong> to add one.</span>`;
    listEl.appendChild(hint);
    return;
  }
  
  models.forEach((model, index) => {
    const div = document.createElement('div');
    div.className = 'model-item';
    const displayName = getModelDisplayName(model);
    div.innerHTML = `
      <div class="model-item-info">
        <span class="model-item-name">${displayName}</span>
        <span class="model-item-id">${model.id}</span>
        <div class="model-item-badges">
          ${model.context ? `<span class="model-item-badge">${(model.context / 1000).toFixed(0)}K</span>` : ''}
          ${model.vision ? '<span class="model-item-badge vision">vision</span>' : ''}
        </div>
      </div>
      <div class="model-item-actions">
        <button class="model-item-btn edit" title="Edit" data-provider="${provider}" data-index="${index}">
          <i data-lucide="pencil"></i>
        </button>
        <button class="model-item-btn delete" title="Delete" data-provider="${provider}" data-index="${index}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    listEl.appendChild(div);
  });
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  // Wire up edit/delete buttons
  listEl.querySelectorAll('.model-item-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.provider;
      const index = parseInt(btn.dataset.index);
      editModel(provider, index);
    });
  });
  
  listEl.querySelectorAll('.model-item-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.provider;
      const index = parseInt(btn.dataset.index);
      deleteModel(provider, index);
    });
  });
}

// Add model modal elements
const addModelModal = document.getElementById('addModelModal');
const addModelTitle = document.getElementById('addModelTitle');
const addModelClose = document.getElementById('addModelClose');
const modelTabsField = document.getElementById('modelTabsField');
const modelPresetField = document.getElementById('modelPresetField');
const availableModelsTab = document.getElementById('availableModelsTab');
const customModelsTab = document.getElementById('customModelsTab');
const remoteModelFields = document.getElementById('remoteModelFields');
const modelIdInput = document.getElementById('modelId');
const modelNameInput = document.getElementById('modelName');
const remoteModelIdInput = document.getElementById('remoteModelId');
const remoteModelNameInput = document.getElementById('remoteModelName');
const modelContextInput = document.getElementById('modelContext');
const modelVisionInput = document.getElementById('modelVision');
const modelProviderInput = document.getElementById('modelProvider');
const editingModelIdInput = document.getElementById('editingModelId');
const cancelModelBtn = document.getElementById('cancelModelBtn');
const saveModelBtn = document.getElementById('saveModelBtn');

// Built-in MLC models that can be selected
// See full list: https://github.com/ArtifactsMMO/node_modules/tree/main/@mlc-ai/web-llm-models
const BUILTIN_LOCAL_MODELS = [
  // Small models (< 2GB VRAM)
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', name: 'SmolLM2 360M', context: 4096, vram: 300 },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 0.5B', context: 4096, vram: 500 },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', context: 4096, vram: 879 },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 1.5B', context: 4096, vram: 1100 },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM2 1.7B', context: 4096, vram: 1200 },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', context: 4096, vram: 1600 },
  
  // Medium models (2-4GB VRAM)
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 3B', context: 4096, vram: 2100 },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', context: 4096, vram: 2200 },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 Mini (3.8B)', context: 4096, vram: 2500 },
  { id: 'stablelm-2-zephyr-1_6b-q4f16_1-MLC', name: 'StableLM 2 Zephyr 1.6B', context: 4096, vram: 1200 },
  
  // Large models (4-6GB VRAM)
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 7B', context: 4096, vram: 4500 },
  { id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', name: 'Mistral 7B v0.3', context: 4096, vram: 4500 },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', name: 'Llama 3.1 8B', context: 4096, vram: 5100 },
  { id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC', name: 'Hermes 3 Llama 8B', context: 4096, vram: 5100 },
  
  // Coding models
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 Coder 1.5B', context: 4096, vram: 1100 },
  { id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 Coder 7B', context: 4096, vram: 4500 },
  
  // Math models
  { id: 'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 Math 1.5B', context: 4096, vram: 1100 },
  { id: 'Qwen2.5-Math-7B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 Math 7B', context: 4096, vram: 4500 },
  
  // DeepSeek
  { id: 'DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC', name: 'DeepSeek R1 Qwen 1.5B', context: 4096, vram: 1100 },
  { id: 'DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC', name: 'DeepSeek R1 Llama 8B', context: 4096, vram: 5100 },
];

let selectedPresetModel = null;
let currentModelTab = 'available';

function renderPresetList() {
  if (!modelPresetField) return;
  
  modelPresetField.innerHTML = '';
  
  // Add built-in models
  for (const model of BUILTIN_LOCAL_MODELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'model-preset-item' + (selectedPresetModel?.id === model.id ? ' selected' : '');
    btn.innerHTML = `
      <div class="preset-info">
        <span class="preset-name">${model.name}</span>
        <span class="preset-desc">~${model.vram}MB VRAM</span>
      </div>
    `;
    btn.addEventListener('click', () => selectPreset(model));
    modelPresetField.appendChild(btn);
  }
}

function selectPreset(model) {
  selectedPresetModel = model;
  renderPresetList();
}

function switchModelTab(tab) {
  currentModelTab = tab;
  selectedPresetModel = null;
  
  // Update tab buttons
  modelTabsField?.querySelectorAll('.model-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  // Show/hide content
  if (availableModelsTab) availableModelsTab.style.display = tab === 'available' ? 'block' : 'none';
  if (customModelsTab) customModelsTab.style.display = tab === 'custom' ? 'block' : 'none';
  
  // Clear fields when switching
  if (modelIdInput) modelIdInput.value = '';
  if (modelNameInput) modelNameInput.value = '';
  if (modelUrlInput) modelUrlInput.value = '';
  if (modelLibInput) modelLibInput.value = '';
  if (modelVramInput) modelVramInput.value = '';
  if (localModelContextInput) localModelContextInput.value = '';
  
  if (tab === 'available') {
    renderPresetList();
  }
}

function openAddModelModal(provider) {
  addModelTitle.textContent = 'Add Model';
  modelProviderInput.value = provider;
  editingModelIdInput.value = '';
  selectedPresetModel = null;
  currentModelTab = 'available';
  
  // Clear all fields
  modelIdInput.value = '';
  modelNameInput.value = '';
  if (remoteModelIdInput) remoteModelIdInput.value = '';
  if (remoteModelNameInput) remoteModelNameInput.value = '';
  modelContextInput.value = '';
  modelVisionInput.checked = false;
  
  // Show/hide provider-specific sections
  const isLocal = provider === 'local';
  const isRemote = provider === 'remote';
  
  // Show tabs and local content for local provider
  if (modelTabsField) modelTabsField.style.display = isLocal ? 'flex' : 'none';
  if (availableModelsTab) availableModelsTab.style.display = isLocal ? 'block' : 'none';
  if (customModelsTab) customModelsTab.style.display = 'none';
  if (remoteModelFields) remoteModelFields.style.display = isRemote ? 'block' : 'none';
  
  // Reset tabs to available
  modelTabsField?.querySelectorAll('.model-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === 'available');
  });
  
  if (isLocal) renderPresetList();
  
  modelApiTypeChat?.classList.add('active');
  modelApiTypeResponses?.classList.remove('active');
  
  addModelModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function editModel(provider, index) {
  const customModels = getCustomModels();
  const model = customModels[provider]?.[index];
  if (!model) return;
  
  addModelTitle.textContent = 'Edit Model';
  modelProviderInput.value = provider;
  editingModelIdInput.value = index.toString();
  
  const isLocal = provider === 'local';
  const isRemote = provider === 'remote';
  
  if (isLocal) {
    // For local: show custom tab with fields filled
    currentModelTab = 'custom';
    selectedPresetModel = null;
    modelIdInput.value = model.id;
    modelNameInput.value = model.name || '';
    if (modelUrlInput) modelUrlInput.value = model.modelUrl || '';
    if (modelLibInput) modelLibInput.value = model.modelLib || '';
    if (modelVramInput) modelVramInput.value = model.vramRequired || '';
    if (localModelContextInput) localModelContextInput.value = model.context || '';
    
    if (modelTabsField) modelTabsField.style.display = 'flex';
    if (availableModelsTab) availableModelsTab.style.display = 'none';
    if (customModelsTab) customModelsTab.style.display = 'block';
    if (remoteModelFields) remoteModelFields.style.display = 'none';
    
    modelTabsField?.querySelectorAll('.model-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === 'custom');
    });
  } else {
    // For remote
    if (remoteModelIdInput) remoteModelIdInput.value = model.id;
    if (remoteModelNameInput) remoteModelNameInput.value = model.name || '';
    if (modelContextInput) modelContextInput.value = model.context || '';
    if (modelVisionInput) modelVisionInput.checked = model.vision || false;
    
    if (modelTabsField) modelTabsField.style.display = 'none';
    if (availableModelsTab) availableModelsTab.style.display = 'none';
    if (customModelsTab) customModelsTab.style.display = 'none';
    if (remoteModelFields) remoteModelFields.style.display = 'block';
    
    modelApiTypeChat?.classList.toggle('active', model.apiType !== 'responses');
    modelApiTypeResponses?.classList.toggle('active', model.apiType === 'responses');
  }
  
  addModelModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAddModelModal() {
  addModelModal.classList.remove('open');
  const anySettingsOpen = settingsModal?.classList.contains('open') || localSettingsModal?.classList.contains('open');
  document.body.style.overflow = anySettingsOpen ? 'hidden' : '';
}

function saveModel() {
  const provider = modelProviderInput.value;
  const isLocal = provider === 'local';
  const isRemote = provider === 'remote';
  
  let modelId, modelName, model;
  
  if (isLocal) {
    if (currentModelTab === 'available' && selectedPresetModel) {
      // Using a preset
      modelId = selectedPresetModel.id;
      modelName = selectedPresetModel.name;
      model = {
        id: modelId,
        name: modelName,
        context: selectedPresetModel.context || 4096,
        vramRequired: selectedPresetModel.vram,
        vision: false
      };
    } else {
      // Custom model
      modelId = modelIdInput.value.trim();
      modelName = modelNameInput.value.trim();
      model = {
        id: modelId,
        name: modelName || modelId,
        context: localModelContextInput?.value ? parseInt(localModelContextInput.value) : 4096,
        vramRequired: modelVramInput?.value ? parseInt(modelVramInput.value) : null,
        modelUrl: modelUrlInput?.value.trim() || null,
        modelLib: modelLibInput?.value.trim() || null,
        vision: false
      };
    }
  } else {
    modelId = remoteModelIdInput?.value.trim();
    modelName = remoteModelNameInput?.value.trim();
    model = {
      id: modelId,
      name: modelName || modelId,
      context: modelContextInput?.value ? parseInt(modelContextInput.value) : null,
      vision: modelVisionInput?.checked || false,
      apiType: modelApiTypeResponses?.classList.contains('active') ? 'responses' : 'chat'
    };
  }
  
  if (!modelId) {
    alert(isLocal && currentModelTab === 'available' ? 'Please select a model' : 'Model ID is required');
    return;
  }
  
  const customModels = getCustomModels();
  if (!customModels[provider]) customModels[provider] = [];
  
  const editingIndex = editingModelIdInput.value;
  if (editingIndex !== '') {
    // Update existing
    customModels[provider][parseInt(editingIndex)] = model;
  } else {
    // Check for duplicate
    if (customModels[provider].some(m => m.id === modelId)) {
      alert('A model with this ID already exists');
      return;
    }
    customModels[provider].push(model);
  }
  
  saveCustomModels(customModels);
  renderModelsList(provider);
  closeAddModelModal();
  loadModels(); // Refresh main model picker
}

function deleteModel(provider, index) {
  if (!confirm('Delete this model?')) return;
  
  const customModels = getCustomModels();
  customModels[provider]?.splice(index, 1);
  saveCustomModels(customModels);
  renderModelsList(provider);
  loadModels(); // Refresh main model picker
}

// Wire up add model buttons
document.querySelectorAll('.add-model-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const provider = btn.dataset.provider;
    openAddModelModal(provider);
  });
});

// Add model modal event listeners
addModelClose?.addEventListener('click', closeAddModelModal);
cancelModelBtn?.addEventListener('click', closeAddModelModal);
saveModelBtn?.addEventListener('click', saveModel);
addModelModal?.addEventListener('click', (e) => {
  if (e.target === addModelModal) closeAddModelModal();
});

// Tab switching for local models
modelTabsField?.querySelectorAll('.model-tab').forEach(btn => {
  btn.addEventListener('click', () => switchModelTab(btn.dataset.tab));
});

// Enter to save in model form
modelIdInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveModel();
});
modelNameInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveModel();
});

// ─────────────────────────────────────────────────────────────
// OpenAI Provider (browser-side)
// ─────────────────────────────────────────────────────────────

function getModelApiType(modelId) {
  const customModels = getCustomModels();
  const model = customModels.remote?.find(m => m.id === modelId);
  return model?.apiType || 'chat';
}

async function sendMessageOpenAI(messages, onDelta) {
  const apiKey = await getApiKey('remote');
  let baseUrl = getBaseUrl('remote').replace(/\/+$/, ''); // Remove trailing slashes
  const apiType = getModelApiType(currentModel);
  
  if (!apiKey) {
    throw new Error('API key not configured. Click settings to add it.');
  }
  
  // Localhost URLs connect directly to client's local machine (no proxy)
  // For CORS, user must configure their local server to allow browser requests
  // Non-localhost URLs also go direct (OpenAI allows CORS)
  
  // Use Responses API or Chat Completions API
  if (apiType === 'responses') {
    await sendMessageOpenAIResponses(messages, onDelta, apiKey, baseUrl);
  } else {
    await sendMessageOpenAIChat(messages, onDelta, apiKey, baseUrl);
  }
}

async function sendMessageOpenAIChat(messages, onDelta, apiKey, baseUrl) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: currentModel,
      messages: messages,
      stream: true
    }),
    signal: abortController?.signal
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error: ${response.status} - ${err}`);
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch {}
      }
    }
  }
}

async function sendMessageOpenAIResponses(messages, onDelta, apiKey, baseUrl) {
  // Convert messages to Responses API format
  const input = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
    content: m.content
  }));
  
  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: currentModel,
      input: input,
      stream: true
    }),
    signal: abortController?.signal
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Responses API error: ${response.status} - ${err}`);
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          // Responses API uses different delta format
          const delta = json.delta?.content || json.output?.[0]?.content?.[0]?.text;
          if (delta) onDelta(delta);
        } catch {}
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Local LLM Integration
// ─────────────────────────────────────────────────────────────

async function initLocalLLM() {
  if (localLLM) return localLLM;
  
  try {
    // Dynamically import the Local LLM client
    const module = await import('./local-llm.js');
    localLLM = module.default || window.localLLM;
    
    // Set config from APP_CONFIG
    if (APP_CONFIG?.providers?.local) {
      localLLM.setConfig(APP_CONFIG.providers.local);
    }
    
    console.log('[LocalLLM] Client initialized');
    return localLLM;
  } catch (e) {
    console.error('[LocalLLM] Failed to init:', e);
    return null;
  }
}

let currentLocalModelSize = null; // Track size for progress display

function showLocalBanner(show, text = 'Loading model...', modelId = null) {
  if (localBanner) {
    localBanner.style.display = show ? 'block' : 'none';
    if (localBannerText) localBannerText.textContent = text;
    if (localBannerBar) localBannerBar.style.width = '0%';
    
    // Get model size from config for display
    if (modelId && APP_CONFIG?.providers?.local?.models) {
      const model = APP_CONFIG.providers.local.models.find(m => m.id === modelId);
      currentLocalModelSize = model?.vramRequired || null;
    } else if (!show) {
      currentLocalModelSize = null;
    }
  }
}

async function cancelLocalLoad() {
  if (localLLM) {
    await localLLM.cancelLoad();
  }
  showLocalBanner(false);
}

// Wire up cancel button
localBannerCancel?.addEventListener('click', () => {
  cancelLocalLoad();
});

function updateLocalProgress(progress) {
  if (!localBanner) return;
  
  const percent = (progress.progress * 100).toFixed(0);
  const phases = {
    'init': 'Initializing',
    'downloading': 'Downloading',
    'loading': 'Loading',
    'compiling': 'Compiling',
    'gpu': 'GPU Setup',
    'gpu_init': 'GPU Setup',
    'ready': 'Ready',
    'error': 'Error'
  };
  
  const phaseText = phases[progress.phase] || progress.phase;
  
  // Build status text with size if available
  let statusText = `${phaseText} · ${percent}%`;
  if (currentLocalModelSize) {
    if (progress.phase === 'downloading') {
      const downloadedMB = Math.round(currentLocalModelSize * progress.progress);
      statusText = `${phaseText} · ${downloadedMB}/${currentLocalModelSize} MB`;
    } else {
      statusText = `${phaseText} · ${percent}% · ~${currentLocalModelSize} MB`;
    }
  }
  
  if (localBannerText) {
    localBannerText.textContent = statusText;
  }
  if (localBannerBar) {
    localBannerBar.style.width = `${percent}%`;
  }
}

async function checkGPUSupport() {
  if (!navigator.gpu) return { supported: false, reason: 'WebGPU not available' };
  
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supported: false, reason: 'No GPU adapter found' };
    return { supported: true };
  } catch (e) {
    return { supported: false, reason: e.message };
  }
}

async function loadLocalModels() {
  const client = await initLocalLLM();
  if (!client) {
    console.warn('[LocalLLM] Client not available');
    return [];
  }
  
  // Get models from config
  const models = APP_CONFIG?.providers?.webllm?.models || [];
  
  // Check cache status for each model
  const modelsWithStatus = [];
  for (const model of models) {
    try {
      const cached = await client.isModelCached(model.id);
      localModelCache.set(model.id, cached);
      modelsWithStatus.push({ ...model, cached, available: true });
    } catch {
      modelsWithStatus.push({ ...model, cached: false, available: true });
    }
  }
  
  return modelsWithStatus;
}

async function loadLocalModel(modelId) {
  const client = await initLocalLLM();
  if (!client) throw new Error('Local LLM not available');
  
  // WebGPU check is now handled by WebLLM itself with better error messages
  // See: https://webgpureport.org/ for browser compatibility
  
  // Pass custom models from user settings to the client
  const customModels = getCustomModels();
  if (customModels.local) {
    client.setCustomModels(customModels.local);
  }
  
  showLocalBanner(true, 'Initializing...', modelId);
  
  try {
    await client.loadModel(modelId, (progress) => {
      updateLocalProgress(progress);
    });
    
    // Update cache status
    localModelCache.set(modelId, true);
    
    showLocalBanner(false);
    return true;
  } catch (e) {
    showLocalBanner(false);
    // Don't throw if just cancelled
    if (e.message === 'Loading cancelled') {
      return false;
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────
// Provider Management
// ─────────────────────────────────────────────────────────────

function getAvailableProviders() {
  if (!APP_CONFIG?.providers) return ['local'];
  // Return providers in preferred order: browser first, openai last
  const all = Object.keys(APP_CONFIG.providers);
  const order = ['local', 'remote'];
  return order.filter(p => all.includes(p)).concat(all.filter(p => !order.includes(p)));
}

// ─────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────

async function loadConfig() {
  let data = null;
  
  // Try to load from server first (for dev/self-hosted mode)
  try {
    const r = await fetch('/api/config');
    if (r.ok) {
      data = await r.json();
      if (data.ok) {
        console.log('[Config] Loaded from server');
      }
    }
  } catch (e) {
    // Server not available, will use embedded config
  }
  
  // Fall back to embedded config (for static deployment like GitHub Pages)
  if (!data || !data.ok) {
    data = EMBEDDED_CONFIG;
    console.log('[Config] Using embedded config (static mode)');
  }
  
  APP_CONFIG = data;
  
  // Build model context map from config
  MODEL_CONTEXT = { default: 4096 };
  for (const [providerName, provider] of Object.entries(data.providers || {})) {
    for (const model of provider.models || []) {
      if (model.context) {
        MODEL_CONTEXT[model.id] = model.context;
      }
    }
  }
  console.log('[Config] Models loaded:', Object.keys(MODEL_CONTEXT).length);
}

async function loadModels() {
  console.log('[LoadModels] Starting...');
  try {
    modelModalBody.innerHTML = '';
    
    const providers = getAvailableProviders();
    let allModels = [];
    
    
    
    // Pre-fetch API key status for cloud providers
    const hasOpenAIKey = await hasApiKey('remote');
    
    
    // Load custom models from settings
    const customModels = getCustomModels();
    
    // Load models from config for each provider
    for (const provider of providers) {
        const providerConfig = APP_CONFIG?.providers?.[provider];
        const configModels = providerConfig?.models || [];
        
        // Merge config models with custom models
        let providerModels = [...configModels];
      if (customModels[provider]) {
        // Add custom models (avoid duplicates by ID)
        const existingIds = new Set(configModels.map(m => m.id));
        for (const cm of customModels[provider]) {
          if (!existingIds.has(cm.id)) {
            providerModels.push({ ...cm, isCustom: true });
          }
        }
      }
      
      for (const model of providerModels) {
        const modelData = { ...model, provider };
        
        if (provider === 'remote') {
          // Skip cloud models if no API key configured
          if (!hasOpenAIKey) continue;
          modelData.available = true;
        } else {
          modelData.available = true;
        }
        
        // For browser, check cache status
        if (provider === 'local') {
          modelData.cached = localModelCache.get(model.id) || false;
        }
        
        allModels.push(modelData);
      }
    }
    
    // Also check browser cache status asynchronously
    if (providers.includes('local')) {
      try {
        const client = await initLocalLLM();
        if (client) {
          for (const model of allModels.filter(m => m.provider === 'local')) {
            const cached = await client.isModelCached(model.id);
            model.cached = cached;
            localModelCache.set(model.id, cached);
          }
        }
      } catch (e) {
        console.warn('[LocalLLM] Could not check cache:', e);
      }
    }

    console.log('[LoadModels] Found models:', allModels.length);
    if (!allModels.length) {
      modelBtn.textContent = 'Select Model';
      return;
    }

    // Group models by provider
    const groupedModels = {};
    for (const model of allModels) {
      if (!groupedModels[model.provider]) {
        groupedModels[model.provider] = [];
      }
      groupedModels[model.provider].push(model);
    }

    // Sort models within each group - cached first for local, preserve config order otherwise
    for (const provider of Object.keys(groupedModels)) {
      if (provider === 'local') {
        groupedModels[provider].sort((a, b) => {
          // Cached first
          if (a.cached !== b.cached) return b.cached ? 1 : -1;
          return 0; // Preserve config order
        });
      }
    }

    // Render models grouped by provider
    const providerLabels = {
      'local': 'Local Models',
      'remote': 'Remote Models'
    };
    
    const multipleProviders = providers.filter(p => (groupedModels[p]?.length || 0) > 0).length > 1;

    for (const provider of providers) {
      const models = groupedModels[provider] || [];
      
      // Always show OpenAI section (with settings), skip others if empty
      if (!models.length && provider !== 'remote') continue;
      
      // Always show provider section label
      const label = document.createElement('div');
      label.className = 'picker-modal-label';
      label.innerHTML = `
        <span>${providerLabels[provider] || provider}</span>
        ${(provider === 'remote' || provider === 'local') ? '<button class="picker-label-settings"><i data-lucide="settings"></i></button>' : ''}
      `;
      modelModalBody.appendChild(label);
      
      // Add settings click handler
      if (provider === 'remote' || provider === 'local') {
        const settingsBtn = label.querySelector('.picker-label-settings');
        if (settingsBtn) {
          settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            closeModal(modelModal);
            if (provider === 'local') {
              openLocalSettings();
            } else {
              openSettings();
            }
          });
        }
      }
      
      // Show hint if no OpenAI models configured
      if (provider === 'remote' && !models.length) {
        const hint = document.createElement('div');
        hint.className = 'picker-modal-hint';
        hint.textContent = 'Configure Base URL & models in settings';
        modelModalBody.appendChild(hint);
        continue;
      }
      
      // Add models
      for (const model of models) {
        const opt = document.createElement('button');
        opt.className = 'picker-modal-option' + (model.id === currentModel ? ' active' : '');
        opt.dataset.id = model.id;
        opt.dataset.provider = model.provider;
        const displayName = getModelDisplayName(model);
        
        // Build model option HTML
        const params = model.parameters ? `${model.parameters}` : '';
        
        let badges = '';
        let sizeInfo = '';
        if (model.provider === 'local') {
          if (model.cached) {
            badges += '<span class="model-badge cached">cached</span>';
          } else if (model.vramRequired) {
            sizeInfo = `~${model.vramRequired}MB`;
          }
        }
        if (model.vision) badges += '<span class="model-badge vision">vision</span>';
        
        opt.innerHTML = `
          <div class="model-option">
            <span class="model-option-name">${displayName}</span>
            <div class="model-option-meta">
              ${params ? `<span>${params}</span>` : ''}
              ${sizeInfo ? `<span>${sizeInfo}</span>` : ''}
              ${badges}
            </div>
          </div>
        `;
        
        opt.disabled = !model.available && model.provider !== 'local';
        
        if (model.available !== false || model.provider === 'local') {
          opt.addEventListener('click', () => {
            selectModel(model.id, model.name || model.id, model.provider);
            closeModal(modelModal);
          });
        }
        
        modelModalBody.appendChild(opt);
      }
    }

    // Re-render lucide icons
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Auto-select default model based on device type
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const defaultModelId = isMobile 
      ? (APP_CONFIG?.defaults?.mobileModel || APP_CONFIG?.defaults?.model)
      : APP_CONFIG?.defaults?.model;
    
    // Only restore saved model if one was previously selected AND it still exists
    const savedModelId = localStorage.getItem('selectedModel');
    const savedProvider = localStorage.getItem('selectedProvider');
    
    if (savedModelId && savedProvider) {
      const savedModel = allModels.find(m => m.id === savedModelId && m.provider === savedProvider && (m.available || m.provider === 'local'));
      if (savedModel) {
        selectModel(savedModel.id, getModelDisplayName(savedModel), savedModel.provider);
        return;
      } else {
        // Clear invalid saved model
        console.log('[LoadModels] Saved model no longer exists, clearing:', savedModelId);
        localStorage.removeItem('selectedModel');
        localStorage.removeItem('selectedProvider');
      }
    }
    
    // Use default model for device type
    if (defaultModelId) {
      const defaultModel = allModels.find(m => m.id === defaultModelId && (m.available || m.provider === 'local'));
      if (defaultModel) {
        console.log(`[LoadModels] Auto-selecting ${isMobile ? 'mobile' : 'desktop'} default:`, defaultModelId);
        selectModel(defaultModel.id, getModelDisplayName(defaultModel), defaultModel.provider);
        return;
      }
    }
    
    // Fallback: no model selected - user must choose
    console.log('[LoadModels] No default model found, user must select');
    modelBtn.textContent = 'Select Model';
    currentModel = null;
    currentProvider = null;

  } catch (e) {
    console.error('[Models] Load error:', e);
    setStatus(`Failed to load models: ${e.message}`, true);
    modelBtn.textContent = 'Select Model';
  }
}

function checkModelNameConflict(name, currentProvider) {
  // Check if any other provider has a model with the same name
  const providers = getAvailableProviders();
  const customModels = getCustomModels();
  
  for (const provider of providers) {
    if (provider === currentProvider) continue;
    
    const configModels = APP_CONFIG?.providers?.[provider]?.models || [];
    const custom = customModels[provider] || [];
    const allModels = [...configModels, ...custom];
    
    if (allModels.some(m => (m.name || m.id) === name)) {
      return true;
    }
  }
  return false;
}

async function selectModel(id, name, provider) {
  currentModel = id;
  currentProvider = provider || currentProvider;
  const displayName = getModelDisplayName({ id, name });
  
  // Check if there's a model with the same name in another provider
  const hasConflict = checkModelNameConflict(displayName, provider);
  
  // Only show provider suffix if there's a naming conflict
  if (hasConflict) {
    const providerLabels = { 'local': 'Local', 'remote': 'Remote' };
    modelBtn.textContent = `${displayName} (${providerLabels[currentProvider] || currentProvider})`;
  } else {
    modelBtn.textContent = displayName;
  }
  
  localStorage.setItem('selectedModel', id);
  localStorage.setItem('selectedProvider', currentProvider);
  
  // Update active state
  modelModalBody.querySelectorAll('.picker-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.id === id && opt.dataset.provider === currentProvider);
  });
  
  closeModal(modelModal);
  
  // Update vision support (enable/disable image picker)
  updateVisionSupport();
  
  // For browser models, check if we need to load
  if (currentProvider === 'local') {
    const cached = localModelCache.get(id);
    if (!cached) {
      console.log(`[LocalLLM] Model ${id} not cached, will load on first use`);
    }
  } else {
    checkHealth();
  }
}

/**
 * Check if current model supports vision and update UI
 * Vision defaults to false - must be explicitly set to true in config
 */
function updateVisionSupport() {
  const modelInfo = getModelInfo(currentModel, currentProvider);
  // Default to false, only true if explicitly set
  const supportsVision = modelInfo?.vision === true;
  
  // Update upload button visibility
  if (uploadBtn) {
    uploadBtn.style.display = supportsVision ? '' : 'none';
  }
  
  // Clear any pending images if vision not supported
  if (!supportsVision && pendingImages.length > 0) {
    clearPendingImages();
  }
}

/**
 * Get model info from config
 */
function getModelInfo(modelId, provider) {
  // Check config models first
  const providerConfig = APP_CONFIG?.providers?.[provider];
  if (providerConfig?.models) {
    const configModel = providerConfig.models.find(m => m.id === modelId);
    if (configModel) return configModel;
  }
  
  // Check custom models
  const customModels = getCustomModels();
  if (customModels[provider]) {
    const customModel = customModels[provider].find(m => m.id === modelId);
    if (customModel) return customModel;
  }
  
  return null;
}

/**
 * Get a human-friendly model display name
 */
function getModelDisplayName(model) {
  if (!model) return '';
  if (typeof model === 'string') {
    return prettifyModelId(model);
  }
  if (model.name && model.name.trim()) {
    return model.name;
  }
  return prettifyModelId(model.id || '');
}

function prettifyModelId(id) {
  if (!id) return '';
  const cleaned = id
    .replace(/-?mlc$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  // Title-case words but keep acronyms as-is
  return cleaned.split(' ').map(w => {
    if (!w) return '';
    if (w === w.toUpperCase()) return w;
    return w[0].toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

async function checkHealth() {
  // Browser and OpenAI providers don't need server health check
  if (currentProvider === 'local' || currentProvider === 'remote') {
    setStatus('');
    return;
  }
  
  try {
    const r = await fetch(`/api/health?provider=${currentProvider}`);
    const data = await r.json();
    
    if (data.ok) {
      setStatus('');  // Clear status when ready
    } else {
      setStatus('Offline', true);
    }
  } catch (e) {
    setStatus('Offline', true);
  }
}

// ─────────────────────────────────────────────────────────────
// Chat / Streaming
// ─────────────────────────────────────────────────────────────
function parseNdjsonLines(buffer) {
  const lines = buffer.split('\n');
  const remainder = lines.pop();
  const objs = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try { objs.push(JSON.parse(t)); } catch {}
  }
  
  return [objs, remainder];
}

// ─────────────────────────────────────────────────────────────
// Local LLM Chat (browser-side inference)
// ─────────────────────────────────────────────────────────────
async function sendMessageLocal(text, attachedImages, assistantDiv, textEl) {
  let acc = '';
  let aborted = false;
  
  // Setup abort handler for stop button
  abortController = new AbortController();
  abortController.signal.addEventListener('abort', () => {
    aborted = true;
    // Interrupt generation if streaming, or cancel load if still loading
    if (localLLM?.isLoading) {
      cancelLocalLoad();
    } else if (localLLM) {
      localLLM.abortStream();
    }
  });
  
  try {
    // Initialize Local LLM client
    const client = await initLocalLLM();
    if (!client) {
      throw new Error('Local LLM not available');
    }
    
    // Check if model is loaded, if not load it (non-blocking banner)
    if (!client.isLoaded(currentModel)) {
      textEl.innerHTML = `<span class="loading-text">Waiting for model</span>`;
      
      const loaded = await loadLocalModel(currentModel);
      if (!loaded || aborted) {
        // Loading was cancelled
        textEl.innerHTML = `<em style="color: var(--muted)">Cancelled</em>`;
        assistantDiv.classList.add('no-content');
        assistantDiv.classList.add('done');
        // Remove the user message we just added since we cancelled
        messages.pop();
        isStreaming = false;
        setStreamingMode(false);
        return;
      }
      
      textEl.innerHTML = `<span class="loading-text">Generating</span>`;
    }
    
    // Build messages for browser (simpler format)
    const systemPrompt = {
      role: 'system',
      content: 'You are ensu, a helpful and friendly assistant. Be concise in your responses.'
    };
    
    // Get recent history (browser LLM has its own context management)
    const historyMsgs = messages.slice(-6); // Last 6 messages
    const apiMessages = [systemPrompt];
    
    for (const m of historyMsgs) {
      apiMessages.push({
        role: m.role,
        content: m.content || ''
      });
    }
    
    console.log('[LocalLLM] Sending:', {
      model: currentModel,
      messageCount: apiMessages.length
    });
    
    // Stream response using callback-based approach
    let streamComplete = false;
    
    const streamPromise = client.chatStream(apiMessages, (chunk) => {
      if (aborted || streamComplete) {
        return false; // Stop iteration
      }
      if (chunk.delta) {
        acc += chunk.delta;
        textEl.innerHTML = renderMarkdown(acc);
        scrollToBottom();
      }
      if (chunk.done) {
        streamComplete = true;
      }
      if (chunk.error) {
        streamComplete = true;
      }
      return !aborted; // Continue if not aborted
    });
    
    // Wait for either stream completion or abort
    await streamPromise;
    
    // Final render
    if (acc || aborted) {
      if (acc) {
        textEl.innerHTML = renderMarkdown(acc);
        messages.push({ role: 'assistant', content: acc });
      } else {
        textEl.innerHTML = `<em style="color: var(--muted)">Stopped</em>`;
        assistantDiv.classList.add('no-content');
      }
      assistantDiv.classList.add('done');
    } else {
      textEl.innerHTML = `<em style="color: var(--muted)">No response received</em>`;
      assistantDiv.classList.add('no-content');
      assistantDiv.classList.add('done');
    }
    
    updateDividers();
    setStatus('');
    
  } catch (e) {
    console.error('[LocalLLM] Error:', e);
    
    if (acc) {
      // Partial response
      textEl.innerHTML = renderMarkdown(acc);
      messages.push({ role: 'assistant', content: acc });
    } else {
      textEl.innerHTML = `<em style="color: var(--muted)">Error: ${e.message}</em>`;
      assistantDiv.classList.add('no-content');
    }
    assistantDiv.classList.add('done');
    setStatus('Error', true);
    
  } finally {
    abortController = null;
    isStreaming = false;
    userHasScrolledUp = false;
    updateScrollButton();
    setStreamingMode(false);
    inputEl.focus();
    saveCurrentSession();
  }
}

// ─────────────────────────────────────────────────────────────
// Cloud API Chat (OpenAI - browser-side)
// ─────────────────────────────────────────────────────────────
async function sendMessageCloudAPI(text, attachedImages, assistantDiv, textEl) {
  let acc = '';
  
  // Setup abort controller
  abortController = new AbortController();
  
  try {
    // Build messages
    const systemPrompt = {
      role: 'system',
      content: 'You are ensu, a helpful and friendly assistant. Be concise in your responses.'
    };
    
    const historyMsgs = messages.slice(-10); // Last 10 messages
    const apiMessages = [systemPrompt, ...historyMsgs];
    
    // Send to appropriate provider
    const onDelta = (delta) => {
      acc += delta;
      textEl.innerHTML = renderMarkdown(acc);
      scrollToBottom();
    };
    
    if (currentProvider === 'remote') {
      await sendMessageOpenAI(apiMessages, onDelta);
    }
    
    // Final render
    if (acc) {
      textEl.innerHTML = renderMarkdown(acc);
      messages.push({ role: 'assistant', content: acc });
      assistantDiv.classList.add('done');
    } else {
      textEl.innerHTML = `<em style="color: var(--muted)">No response received</em>`;
      assistantDiv.classList.add('no-content');
      assistantDiv.classList.add('done');
    }
    
    updateDividers();
    setStatus('');
    
  } catch (e) {
    console.error(`[${currentProvider}] Error:`, e);
    
    if (e.name === 'AbortError') {
      if (acc) {
        textEl.innerHTML = renderMarkdown(acc);
        messages.push({ role: 'assistant', content: acc });
      } else {
        textEl.innerHTML = `<em style="color: var(--muted)">Stopped</em>`;
        assistantDiv.classList.add('no-content');
      }
    } else {
      textEl.innerHTML = `<em style="color: var(--muted)">Error: ${e.message}</em>`;
      assistantDiv.classList.add('no-content');
    }
    assistantDiv.classList.add('done');
    
  } finally {
    abortController = null;
    isStreaming = false;
    userHasScrolledUp = false;
    updateScrollButton();
    setStreamingMode(false);
    inputEl.focus();
    saveCurrentSession();
  }
}

async function sendMessage(text) {
  if (!currentModel) {
    alert('Please select a model first');
    return;
  }

  isStreaming = true;
  setStreamingMode(true);
  userHasScrolledUp = false; // Reset scroll tracking on new message
  updateScrollButton();
  scrollToBottom(); // Scroll when user sends
  
  // Capture pending image (limited to 1 at UI level)
  const attachedImages = [...pendingImages];
  clearPendingImages();
  
  // Build message with images if any
  const userMessage = { role: 'user', content: text };
  if (attachedImages.length > 0) {
    userMessage.images = attachedImages.map(img => img.base64);
  }
  
  // Add user message
  messages.push(userMessage);
  addMessage('user', text, attachedImages);

  // Create assistant placeholder with loading state
  const assistantDiv = addMessage('assistant', '');
  const textEl = assistantDiv.querySelector('.text');
  const loadingTexts = [
    'Cooking', 'Thinking', 'Generating', 'Building', 'Crafting',
    'Composing', 'Pondering', 'Brewing', 'Conjuring', 'Weaving',
    'Dreaming', 'Imagining', 'Creating', 'Formulating', 'Designing',
    'Sculpting', 'Painting', 'Writing', 'Sketching', 'Drafting',
    'Processing', 'Computing', 'Calculating', 'Analyzing', 'Reasoning',
    'Contemplating', 'Reflecting', 'Meditating', 'Musing', 'Ruminating',
    'Assembling', 'Constructing', 'Forging', 'Molding', 'Shaping',
    'Mixing', 'Blending', 'Stirring', 'Simmering', 'Baking',
    'Spinning', 'Knitting', 'Stitching', 'Threading', 'Lacing',
    'Channeling', 'Summoning', 'Invoking', 'Manifesting', 'Materializing',
    'Distilling', 'Refining', 'Polishing', 'Honing', 'Perfecting',
    'Orchestrating', 'Arranging', 'Harmonizing', 'Tuning', 'Syncing',
    'Decoding', 'Parsing', 'Interpreting', 'Translating', 'Deciphering',
    'Exploring', 'Discovering', 'Unearthing', 'Excavating', 'Mining',
    'Plotting', 'Scheming', 'Planning', 'Strategizing', 'Mapping',
    'Whipping up', 'Rustling up', 'Putting together', 'Working on', 'Preparing',
    'Concocting', 'Devising', 'Hatching', 'Inventing', 'Improvising',
    'Nurturing', 'Cultivating', 'Growing', 'Sprouting', 'Blooming',
    'Sparking', 'Igniting', 'Kindling', 'Firing up', 'Warming up',
    'Loading', 'Buffering', 'Streaming', 'Downloading', 'Syncing'
  ];
  const loadingText = loadingTexts[Math.floor(Math.random() * loadingTexts.length)];
  textEl.innerHTML = `<span class="loading-text">${loadingText}</span>`;
  
  // Route based on provider
  if (currentProvider === 'local') {
    await sendMessageLocal(text, attachedImages, assistantDiv, textEl);
    return;
  }
  
  if (currentProvider === 'remote') {
    await sendMessageCloudAPI(text, attachedImages, assistantDiv, textEl);
    return;
  }
  
  // Unsupported provider
  textEl.innerHTML = `<em style="color: var(--muted)">Unsupported provider: ${currentProvider}</em>`;
  assistantDiv.classList.add('no-content');
  assistantDiv.classList.add('done');
  isStreaming = false;
  setStreamingMode(false);
}

// ─────────────────────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────────────────────
let inputFocused = false;

function updateButtonStates() {
  const text = inputEl.value;
  const hasText = text.trim().length > 0;
  const hasImages = pendingImages.length > 0;
  
  // Send button: highlight when there's text or images to send
  if (hasText || hasImages) {
    sendBtn.classList.add('ready');
  } else {
    sendBtn.classList.remove('ready');
  }
  
  // Attach button: highlight when images attached, input focused, or has text
  if (hasImages || inputFocused || hasText) {
    uploadBtn.classList.add('active');
  } else {
    uploadBtn.classList.remove('active');
  }
  
  // Character count warning when approaching limit
  const charCount = text.length;
  const warningThreshold = MAX_INPUT_LENGTH * 0.8; // Warn at 80%
  
  if (charCount > warningThreshold) {
    inputEl.style.borderColor = charCount > MAX_INPUT_LENGTH ? '#c44' : '#c90';
    inputEl.title = `${charCount}/${MAX_INPUT_LENGTH} characters`;
  } else {
    inputEl.style.borderColor = '';
    inputEl.title = '';
  }
}

function send() {
  const text = inputEl.value.trim();
  if ((!text && pendingImages.length === 0) || isStreaming) return;
  
  // Validate input length
  if (text.length > MAX_INPUT_LENGTH) {
    alert(`Message too long (${text.length} chars). Maximum is ${MAX_INPUT_LENGTH} characters.`);
    return;
  }
  
  inputEl.value = '';
  inputEl.style.height = 'auto';
  updateButtonStates();
  sendMessage(text);
}

function retryLastMessage(msgDiv) {
  if (isStreaming) return;
  
  // Find the index of this assistant message in the DOM
  const allMsgs = Array.from(chatEl.querySelectorAll('.message'));
  const msgIndex = allMsgs.indexOf(msgDiv);
  
  // Find the last user message before this assistant message
  let userMsgIndex = -1;
  let userMsgDom = null;
  for (let i = msgIndex - 1; i >= 0; i--) {
    if (allMsgs[i].classList.contains('sent')) {
      userMsgIndex = i;
      userMsgDom = allMsgs[i];
      break;
    }
  }
  
  if (userMsgIndex < 0) return;
  
  // Find corresponding state index
  let stateIndex = 0;
  for (let i = 0; i < allMsgs.length && i <= userMsgIndex; i++) {
    if (allMsgs[i].classList.contains('message')) {
      if (i === userMsgIndex) break;
      stateIndex++;
    }
  }
  
  if (stateIndex >= messages.length) return;
  
  const msgToRetry = messages[stateIndex];
  if (msgToRetry.role !== 'user') return;
  
  // Remove user message and all after it from state
  messages = messages.slice(0, stateIndex);
  
  // Remove from DOM - user message and all after it
  for (let i = allMsgs.length - 1; i >= userMsgIndex; i--) {
    allMsgs[i].remove();
  }
  
  updateDividers();
  
  // Resend with original content and images
  const originalImages = msgToRetry.images ? 
    msgToRetry.images.map(base64 => ({ base64, dataUrl: `data:image/jpeg;base64,${base64}` })) : 
    [];
  
  pendingImages = originalImages;
  sendMessage(msgToRetry.content || '');
}

function stopGeneration() {
  if (abortController) {
    abortController.abort();
  }
}

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// Auto-resize textarea (max 2 lines ~62px)
function autoResizeInput() {
  const maxHeight = 62;
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, maxHeight) + 'px';
  // Show scrollbar if content exceeds max height
  inputEl.style.overflowY = inputEl.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

inputEl.addEventListener('input', () => {
  updateButtonStates();
  autoResizeInput();
});

inputEl.addEventListener('focus', () => {
  inputFocused = true;
  updateButtonStates();
});

inputEl.addEventListener('blur', () => {
  inputFocused = false;
  updateButtonStates();
});

sendBtn.addEventListener('click', () => {
  if (isStreaming) {
    stopGeneration();
  } else {
    send();
  }
});

// Image upload handler
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const files = e.target.files;
  for (const file of files) {
    await handleFileSelect(file);
  }
  fileInput.value = ''; // Reset for next selection
});

// Paste image support
inputEl.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) await handleFileSelect(file);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Image Modal
// ─────────────────────────────────────────────────────────────
function openImageModal(src) {
  modalImage.src = src;
  imageModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeImageModal() {
  imageModal.classList.remove('open');
  modalImage.src = '';
  document.body.style.overflow = '';
}

modalClose?.addEventListener('click', closeImageModal);

imageModal?.addEventListener('click', (e) => {
  if (e.target === imageModal) {
    closeImageModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && imageModal?.classList.contains('open')) {
    closeImageModal();
  }
});

// Delegate click on message images
chatEl.addEventListener('click', (e) => {
  if (e.target.matches('.message-images img')) {
    openImageModal(e.target.src);
  }
});

// ─────────────────────────────────────────────────────────────
// Scroll behavior - compact header & floating input
// ─────────────────────────────────────────────────────────────
function checkCompactMode() {
  // Once committed, stay compact until reset
  if (hasCommittedToCompact) return;
  
  const scrollY = window.scrollY;
  if (scrollY > 50) {
    hasCommittedToCompact = true;
    masthead.classList.add('compact');
    inputArea.classList.add('floating');
  }
}

window.addEventListener('scroll', checkCompactMode, { passive: true });

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────
(async function init() {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  setupMobileKeyboardHandling();

  if (dateEl) dateEl.textContent = formatDate();
  setupPickers();
  
  // Check URL for session ID first (before resetChat clears it)
  const sessionIdFromUrl = getSessionIdFromUrl();
  
  await loadConfig();   // Load app config
  
  // Restore saved provider or use default
  const savedProvider = localStorage.getItem('selectedProvider');
  if (savedProvider && APP_CONFIG?.providers?.[savedProvider]?.enabled) {
    currentProvider = savedProvider;
  }
  
  await loadModels();     // Load models from all providers
  await loadSessions();   // Load saved sessions

  // Load session from URL or start fresh
  if (sessionIdFromUrl) {
    const loaded = await loadSession(sessionIdFromUrl);
    if (!loaded) resetChat();
  } else {
    resetChat();  // Initialize fresh session
  }

  // Update vision support based on selected model
  updateVisionSupport();

  // Auto-focus input
  inputEl.focus();
  updateButtonStates();
})();

// ─────────────────────────────────────────────────────────────
// URL-based Session Routing (uses ?s= query parameter)
// ─────────────────────────────────────────────────────────────
function getSessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('s');
  // Validate: allow alphanumeric, hyphens, underscores (matches sanitizeId in storage.js)
  if (sessionId && /^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return sessionId;
  }
  return null;
}

function updateUrlForSession(sessionId) {
  const url = new URL(window.location.href);
  if (sessionId) {
    url.searchParams.set('s', sessionId);
    history.pushState({ sessionId }, '', url.toString());
  } else {
    url.searchParams.delete('s');
    history.pushState({}, '', url.pathname);
  }
}

// Handle browser back/forward
window.addEventListener('popstate', async (e) => {
  if (e.state?.sessionId) {
    await loadSession(e.state.sessionId);
  } else {
    resetChat();
  }
});
