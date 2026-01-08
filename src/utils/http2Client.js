import http2 from 'http2';
import { URL } from 'url';
import config from '../config/config.js';
import logger from './logger.js';

// Connection pool for HTTP/2 sessions
const sessionPool = new Map();
const SESSION_IDLE_TIMEOUT = 60000; // 60s idle timeout

// Get or create HTTP/2 session for a host
function getSession(origin) {
  if (sessionPool.has(origin)) {
    const session = sessionPool.get(origin);
    if (!session.destroyed && !session.closed) {
      return session;
    }
    sessionPool.delete(origin);
  }

  const session = http2.connect(origin, {
    // HTTP/2 settings to match Go's defaults
    settings: {
      headerTableSize: 4096,
      enablePush: false,
      initialWindowSize: 65535,
      maxFrameSize: 16384,
      maxConcurrentStreams: 100,
      maxHeaderListSize: 262144
    }
  });

  session.on('error', (err) => {
    logger.error(`HTTP/2 session error for ${origin}: ${err.message}`);
    sessionPool.delete(origin);
  });

  session.on('close', () => {
    sessionPool.delete(origin);
  });

  // Auto-close idle sessions
  session.setTimeout(SESSION_IDLE_TIMEOUT, () => {
    session.close();
    sessionPool.delete(origin);
  });

  sessionPool.set(origin, session);
  return session;
}

// Build headers that match the native Go client
function buildHttp2Headers(url, token, extraHeaders = {}) {
  const parsedUrl = new URL(url);
  
  return {
    ':method': 'POST',
    ':path': parsedUrl.pathname + parsedUrl.search,
    ':scheme': parsedUrl.protocol.replace(':', ''),
    ':authority': parsedUrl.host,
    'content-type': 'application/json',
    'authorization': `Bearer ${token}`,
    'user-agent': config.api.userAgent,
    'accept-encoding': 'gzip',
    // Google-specific headers that the native client sends
    'x-goog-api-client': `gl-go/1.24.0 grpc-go/1.78.0 gax/0.5.0`,
    ...extraHeaders
  };
}

// HTTP/2 POST request (non-streaming)
export async function http2Request({ url, token, data, timeout = config.timeout }) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    
    const session = getSession(origin);
    const headers = buildHttp2Headers(url, token);
    
    const body = JSON.stringify(data);
    headers['content-length'] = Buffer.byteLength(body);
    
    const req = session.request(headers);
    
    let responseData = '';
    let responseHeaders = {};
    let statusCode = 0;
    
    const timer = setTimeout(() => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);
    
    req.on('response', (headers) => {
      responseHeaders = headers;
      statusCode = headers[':status'];
    });
    
    req.on('data', (chunk) => {
      responseData += chunk.toString();
    });
    
    req.on('end', () => {
      clearTimeout(timer);
      if (statusCode >= 200 && statusCode < 300) {
        try {
          resolve({ status: statusCode, data: JSON.parse(responseData), headers: responseHeaders });
        } catch {
          resolve({ status: statusCode, data: responseData, headers: responseHeaders });
        }
      } else {
        reject({ status: statusCode, message: responseData, headers: responseHeaders });
      }
    });
    
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    
    req.write(body);
    req.end();
  });
}

// HTTP/2 streaming request (for SSE)
export function http2StreamRequest({ url, token, data, timeout = config.timeout }) {
  const parsedUrl = new URL(url);
  const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
  
  const session = getSession(origin);
  const headers = buildHttp2Headers(url, token);
  
  const body = JSON.stringify(data);
  headers['content-length'] = Buffer.byteLength(body);
  
  const req = session.request(headers);
  
  let statusCode = 0;
  let responseHeaders = {};
  let dataCallback = null;
  let endCallback = null;
  let errorCallback = null;
  let startCallback = null;
  
  const timer = setTimeout(() => {
    req.close(http2.constants.NGHTTP2_CANCEL);
    if (errorCallback) errorCallback(new Error(`Request timeout after ${timeout}ms`));
  }, timeout);
  
  req.on('response', (headers) => {
    responseHeaders = headers;
    statusCode = headers[':status'];
    if (startCallback) startCallback({ status: statusCode, headers: responseHeaders });
  });
  
  req.on('data', (chunk) => {
    if (dataCallback) dataCallback(chunk.toString());
  });
  
  req.on('end', () => {
    clearTimeout(timer);
    if (endCallback) endCallback({ status: statusCode, headers: responseHeaders });
  });
  
  req.on('error', (err) => {
    clearTimeout(timer);
    if (errorCallback) errorCallback(err);
  });
  
  req.write(body);
  req.end();
  
  // Return chainable interface similar to AntigravityRequester
  return {
    onStart(cb) { startCallback = cb; return this; },
    onData(cb) { dataCallback = cb; return this; },
    onEnd(cb) { endCallback = cb; return this; },
    onError(cb) { errorCallback = cb; return this; }
  };
}

// Close all sessions
export function closeAllSessions() {
  for (const [origin, session] of sessionPool) {
    if (!session.destroyed) {
      session.close();
    }
  }
  sessionPool.clear();
  logger.info('All HTTP/2 sessions closed');
}

export default {
  http2Request,
  http2StreamRequest,
  closeAllSessions
};
