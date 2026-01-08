import * as cuimp from 'cuimp';
import config from '../config/config.js';
import logger from './logger.js';

let initialized = false;

async function ensureInit() {
  if (!initialized) {
    // First request will download the binary
    logger.info('curl-impersonate initializing (Chrome TLS fingerprint)');
    initialized = true;
  }
}

// Build headers for Google API requests
function buildHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br'
  };
}

// Non-streaming POST request
export async function cuimpRequest({ url, token, data, timeout = config.timeout }) {
  await ensureInit();
  const headers = buildHeaders(token);
  
  try {
    // Use request() instead of post() because post() has a bug that strips custom headers
    const response = await cuimp.request({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      timeout: timeout, // cuimp uses milliseconds
      impersonate: 'chrome131'
    });
    
    if (response.status >= 200 && response.status < 300) {
      const responseData = typeof response.body === 'string' 
        ? JSON.parse(response.body) 
        : response.body;
      return { status: response.status, data: responseData, headers: response.headers };
    } else {
      // Parse error body if it's JSON
      let errorData = response.body;
      if (typeof response.body === 'string') {
        try { errorData = JSON.parse(response.body); } catch {}
      }
      throw { status: response.status, message: response.body, data: errorData, headers: response.headers };
    }
  } catch (error) {
    if (error.status) throw error;
    throw { status: 500, message: error.message };
  }
}

// Streaming POST request (cuimp doesn't support true streaming, so we fetch full response)
export function cuimpStreamRequest({ url, token, data, timeout = config.timeout }) {
  const headers = buildHeaders(token);
  
  let dataCallback = null;
  let endCallback = null;
  let errorCallback = null;
  let startCallback = null;
  
  // Start the request asynchronously
  (async () => {
    await ensureInit();
    
    try {
      // Use request() instead of post() because post() has a bug that strips custom headers
      const response = await cuimp.request({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        timeout: timeout,
        impersonate: 'chrome131'
      });
      
      const statusCode = response.status;
      const responseHeaders = response.headers || {};
      
      if (startCallback) {
        startCallback({ status: statusCode, headers: responseHeaders });
      }
      
      // Emit the full body as one chunk
      if (dataCallback && response.body) {
        const body = typeof response.body === 'string' ? response.body : response.body.toString();
        dataCallback(body);
      }
      
      if (endCallback) {
        endCallback({ status: statusCode, headers: responseHeaders });
      }
    } catch (error) {
      if (errorCallback) {
        errorCallback(error);
      }
    }
  })();
  
  // Return chainable interface
  return {
    onStart(cb) { startCallback = cb; return this; },
    onData(cb) { dataCallback = cb; return this; },
    onEnd(cb) { endCallback = cb; return this; },
    onError(cb) { errorCallback = cb; return this; }
  };
}

// Close/cleanup
export function closeCuimp() {
  initialized = false;
  logger.info('curl-impersonate client closed');
}

export default {
  cuimpRequest,
  cuimpStreamRequest,
  closeCuimp
};
