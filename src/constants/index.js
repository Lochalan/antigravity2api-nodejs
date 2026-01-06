/**
 * Application constants definition
 * @module constants
 */

// ==================== Cache Related Constants ====================

/**
 * File cache TTL (milliseconds)
 * @type {number}
 */
export const FILE_CACHE_TTL = 5000;

/**
 * File save delay (milliseconds) - for debounce
 * @type {number}
 */
export const FILE_SAVE_DELAY = 1000;

/**
 * Quota cache TTL (milliseconds) - 5 minutes
 * @type {number}
 */
export const QUOTA_CACHE_TTL = 5 * 60 * 1000;

/**
 * Quota cleanup interval (milliseconds) - 1 hour
 * @type {number}
 */
export const QUOTA_CLEANUP_INTERVAL = 60 * 60 * 1000;

/**
 * Model list cache default TTL (milliseconds) - 1 hour
 * @type {number}
 */
export const MODEL_LIST_CACHE_TTL = 60 * 60 * 1000;

// ==================== Memory Management Constants ====================

// Note: Memory pressure thresholds are now dynamically calculated by memoryManager
// based on user-configured memoryThreshold. The user-configured memoryThreshold (MB)
// is the high pressure threshold, other thresholds are calculated proportionally:
// - LOW: 30% threshold
// - MEDIUM: 60% threshold
// - HIGH: 100% threshold (user configured value)
// - TARGET: 50% threshold

/**
 * GC cooldown time (milliseconds)
 * @type {number}
 */
export const GC_COOLDOWN = 10000;

/**
 * Default memory check interval (milliseconds)
 * @type {number}
 */
export const MEMORY_CHECK_INTERVAL = 30000;

// ==================== Server Related Constants ====================

/**
 * Default heartbeat interval (milliseconds)
 * @type {number}
 */
export const DEFAULT_HEARTBEAT_INTERVAL = 15000;

/**
 * Default server port
 * @type {number}
 */
export const DEFAULT_SERVER_PORT = 8045;

/**
 * Default server host
 * @type {string}
 */
export const DEFAULT_SERVER_HOST = '0.0.0.0';

/**
 * Default request timeout (milliseconds)
 * @type {number}
 */
export const DEFAULT_TIMEOUT = 300000;

/**
 * Default retry count
 * @type {number}
 */
export const DEFAULT_RETRY_TIMES = 3;

/**
 * Default max request body size
 * @type {string}
 */
export const DEFAULT_MAX_REQUEST_SIZE = '50mb';

// ==================== Token Rotation Related Constants ====================

/**
 * Default requests per token before switching
 * @type {number}
 */
export const DEFAULT_REQUEST_COUNT_PER_TOKEN = 50;

/**
 * Token early refresh buffer (milliseconds) - 5 minutes
 * @type {number}
 */
export const TOKEN_REFRESH_BUFFER = 300000;

// ==================== Generation Parameter Defaults ====================

/**
 * Default generation parameters
 */
export const DEFAULT_GENERATION_PARAMS = {
  temperature: 1,
  top_p: 0.85,
  top_k: 50,
  max_tokens: 32000,
  thinking_budget: 1024
};

/**
 * reasoning_effort to thinkingBudget mapping
 */
export const REASONING_EFFORT_MAP = {
  low: 1024,
  medium: 16000,
  high: 24000
};

// ==================== Image Related Constants ====================

/**
 * Default max images to keep
 * @type {number}
 */
export const DEFAULT_MAX_IMAGES = 10;

/**
 * MIME type to file extension mapping
 */
export const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

// ==================== Stop Sequences ====================

/**
 * Default stop sequences
 * @type {string[]}
 */
export const DEFAULT_STOP_SEQUENCES = [
  '<|user|>',
  '<|bot|>',
  '<|context_request|>',
  '<|endoftext|>',
  '<|end_of_turn|>'
];

// ==================== Admin Default Configuration ====================

// Note: Admin credentials (username, password, JWT secret) are now automatically
// generated with random values by config.js. If not configured by user, the 
// generated credentials will be displayed in console at startup.
// No longer using hardcoded defaults for improved security