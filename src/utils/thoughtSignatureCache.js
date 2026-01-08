// Simple memory cache: cache thought chain signatures and tool signatures by sessionId + model

const reasoningSignatureCache = new Map();
const toolSignatureCache = new Map();

// Max entries allowed
const MAX_REASONING_ENTRIES = 256;
const MAX_TOOL_ENTRIES = 256;

// Expiration time and cleanup interval (ms)
const ENTRY_TTL_MS = 30 * 60 * 1000;      // 30 minutes
const CLEAN_INTERVAL_MS = 10 * 60 * 1000; // Scan every 10 minutes

function makeKey(sessionId, model) {
  return `${sessionId || ''}::${model || ''}`;
}

function pruneMap(map, targetSize) {
  if (map.size <= targetSize) return;
  const removeCount = map.size - targetSize;
  let removed = 0;
  for (const key of map.keys()) {
    map.delete(key);
    removed++;
    if (removed >= removeCount) break;
  }
}

function pruneExpired(map, now) {
  for (const [key, entry] of map.entries()) {
    if (!entry || typeof entry.ts !== 'number') continue;
    if (now - entry.ts > ENTRY_TTL_MS) {
      map.delete(key);
    }
  }
}

// Periodic cleanup: remove expired signatures by TTL
setInterval(() => {
  const now = Date.now();
  pruneExpired(reasoningSignatureCache, now);
  pruneExpired(toolSignatureCache, now);
}, CLEAN_INTERVAL_MS).unref?.();

export function setReasoningSignature(sessionId, model, signature) {
  if (!signature) return;
  const key = makeKey(sessionId, model);
  reasoningSignatureCache.set(key, { signature, ts: Date.now() });
  // Prevent infinite growth under low pressure
  pruneMap(reasoningSignatureCache, MAX_REASONING_ENTRIES);
}

export function getReasoningSignature(sessionId, model) {
  const key = makeKey(sessionId, model);
  const entry = reasoningSignatureCache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (typeof entry.ts === 'number' && now - entry.ts > ENTRY_TTL_MS) {
    reasoningSignatureCache.delete(key);
    return null;
  }
  return entry.signature || null;
}

export function setToolSignature(sessionId, model, signature) {
  if (!signature) return;
  const key = makeKey(sessionId, model);
  toolSignatureCache.set(key, { signature, ts: Date.now() });
  pruneMap(toolSignatureCache, MAX_TOOL_ENTRIES);
}

export function getToolSignature(sessionId, model) {
  const key = makeKey(sessionId, model);
  const entry = toolSignatureCache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (typeof entry.ts === 'number' && now - entry.ts > ENTRY_TTL_MS) {
    toolSignatureCache.delete(key);
    return null;
  }
  return entry.signature || null;
}

// Reserved: manual cleanup interface (not used externally, but useful for future extension)
export function clearThoughtSignatureCaches() {
  reasoningSignatureCache.clear();
  toolSignatureCache.clear();
}

// Compatibility stubs for Chinese codebase imports
export function setSignature(sessionId, model, signature) {
  setReasoningSignature(sessionId, model, signature);
}

export function shouldCacheSignature() {
  return true;
}

export function isImageModel(modelName) {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  return lower.includes('imagen') || lower.includes('image');
}
