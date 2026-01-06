import express from 'express';
import { generateToken, authMiddleware } from '../auth/jwt.js';
import tokenManager from '../auth/token_manager.js';
import quotaManager from '../auth/quota_manager.js';
import oauthManager from '../auth/oauth_manager.js';
import config, { getConfigJson, saveConfigJson } from '../config/config.js';
import logger from '../utils/logger.js';
import { parseEnvFile, updateEnvFile } from '../utils/envParser.js';
import { reloadConfig } from '../utils/configReloader.js';
import { deepMerge } from '../utils/deepMerge.js';
import { getModelsWithQuotas } from '../api/client.js';
import { getEnvPath } from '../utils/paths.js';
import dotenv from 'dotenv';

const envPath = getEnvPath();

const router = express.Router();

// Login rate limiting - prevent brute force
const loginAttempts = new Map(); // IP -> { count, lastAttempt, blockedUntil }
const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minute window

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip ||
         'unknown';
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  
  if (!attempt) return { allowed: true };
  
  // Check if blocked
  if (attempt.blockedUntil && now < attempt.blockedUntil) {
    const remainingSeconds = Math.ceil((attempt.blockedUntil - now) / 1000);
    return {
      allowed: false,
      message: `Too many login attempts, retry in ${remainingSeconds} seconds`,
      remainingSeconds
    };
  }
  
  // Clean expired attempt records
  if (now - attempt.lastAttempt > ATTEMPT_WINDOW) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  
  return { allowed: true };
}

function recordLoginAttempt(ip, success) {
  const now = Date.now();
  
  if (success) {
    // Login success, clear record
    loginAttempts.delete(ip);
    return;
  }
  
  // Login failed, record attempt
  const attempt = loginAttempts.get(ip) || { count: 0, lastAttempt: now };
  attempt.count++;
  attempt.lastAttempt = now;
  
  // Exceeded max attempts, block
  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    attempt.blockedUntil = now + BLOCK_DURATION;
    logger.warn(`IP ${ip} temporarily blocked due to too many failed login attempts`);
  }
  
  loginAttempts.set(ip, attempt);
}

// Login endpoint
router.post('/login', (req, res) => {
  const clientIP = getClientIP(req);
  
  // Check rate limit
  const rateCheck = checkLoginRateLimit(clientIP);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      message: rateCheck.message,
      retryAfter: rateCheck.remainingSeconds
    });
  }
  
  const { username, password } = req.body;
  
  // Validate input
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  
  // Limit input length to prevent DoS
  if (username.length > 100 || password.length > 100) {
    return res.status(400).json({ success: false, message: 'Input too long' });
  }
  
  if (username === config.admin.username && password === config.admin.password) {
    recordLoginAttempt(clientIP, true);
    const token = generateToken({ username, role: 'admin' });
    res.json({ success: true, token });
  } else {
    recordLoginAttempt(clientIP, false);
    res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
});

// Token management API - requires JWT auth
router.get('/tokens', authMiddleware, async (req, res) => {
  try {
    const tokens = await tokenManager.getTokenList();
    res.json({ success: true, data: tokens });
  } catch (error) {
    logger.error('Failed to get token list:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/tokens', authMiddleware, async (req, res) => {
  const { access_token, refresh_token, expires_in, timestamp, enable, projectId, email } = req.body;
  if (!access_token || !refresh_token) {
    return res.status(400).json({ success: false, message: 'access_token and refresh_token required' });
  }
  const tokenData = { access_token, refresh_token, expires_in };
  if (timestamp) tokenData.timestamp = timestamp;
  if (enable !== undefined) tokenData.enable = enable;
  if (projectId) tokenData.projectId = projectId;
  if (email) tokenData.email = email;
  
  try {
    const result = await tokenManager.addToken(tokenData);
    res.json(result);
  } catch (error) {
    logger.error('Failed to add token:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/tokens/:refreshToken', authMiddleware, async (req, res) => {
  const { refreshToken } = req.params;
  const updates = req.body;
  try {
    const result = await tokenManager.updateToken(refreshToken, updates);
    res.json(result);
  } catch (error) {
    logger.error('Failed to update token:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/tokens/:refreshToken', authMiddleware, async (req, res) => {
  const { refreshToken } = req.params;
  try {
    const result = await tokenManager.deleteToken(refreshToken);
    res.json(result);
  } catch (error) {
    logger.error('Failed to delete token:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/tokens/reload', authMiddleware, async (req, res) => {
  try {
    await tokenManager.reload();
    res.json({ success: true, message: 'Tokens hot-reloaded' });
  } catch (error) {
    logger.error('Hot reload failed:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Refresh specific token's access_token
router.post('/tokens/:refreshToken/refresh', authMiddleware, async (req, res) => {
  const { refreshToken } = req.params;
  try {
    logger.info('Refreshing token...');
    const tokens = await tokenManager.getTokenList();
    const tokenData = tokens.find(t => t.refresh_token === refreshToken);
    
    if (!tokenData) {
      return res.status(404).json({ success: false, message: 'Token not found' });
    }
    
    // Call tokenManager refresh method
    const refreshedToken = await tokenManager.refreshToken(tokenData);
    res.json({ success: true, message: 'Token refreshed successfully', data: { expires_in: refreshedToken.expires_in, timestamp: refreshedToken.timestamp } });
  } catch (error) {
    logger.error('Failed to refresh token:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/oauth/exchange', authMiddleware, async (req, res) => {
  const { code, port } = req.body;
  if (!code || !port) {
    return res.status(400).json({ success: false, message: 'code and port required' });
  }
  
  try {
    const account = await oauthManager.authenticate(code, port);
    const message = account.hasQuota 
      ? 'Token added successfully' 
      : 'Token added (account not eligible, using random ProjectId)';
    res.json({ success: true, data: account, message, fallbackMode: !account.hasQuota });
  } catch (error) {
    logger.error('Authentication failed:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get config
router.get('/config', authMiddleware, (req, res) => {
  try {
    const envData = parseEnvFile(envPath);
    const jsonData = getConfigJson();
    res.json({ success: true, data: { env: envData, json: jsonData } });
  } catch (error) {
    logger.error('Failed to read config:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update config
router.put('/config', authMiddleware, (req, res) => {
  try {
    const { env: envUpdates, json: jsonUpdates } = req.body;
    
    if (envUpdates) updateEnvFile(envPath, envUpdates);
    if (jsonUpdates) saveConfigJson(deepMerge(getConfigJson(), jsonUpdates));
    
    dotenv.config({ override: true });
    reloadConfig();
    
    logger.info('Config updated and hot-reloaded');
    res.json({ success: true, message: 'Config saved (port/host changes require restart)' });
  } catch (error) {
    logger.error('Failed to update config:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get rotation strategy config
router.get('/rotation', authMiddleware, (req, res) => {
  try {
    const rotationConfig = tokenManager.getRotationConfig();
    res.json({ success: true, data: rotationConfig });
  } catch (error) {
    logger.error('Failed to get rotation config:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update rotation strategy config
router.put('/rotation', authMiddleware, (req, res) => {
  try {
    const { strategy, requestCount } = req.body;
    
    // Validate strategy value
    const validStrategies = ['round_robin', 'quota_exhausted', 'request_count'];
    if (strategy && !validStrategies.includes(strategy)) {
      return res.status(400).json({
        success: false,
        message: `Invalid strategy, valid values: ${validStrategies.join(', ')}`
      });
    }
    
    // Update in-memory config
    tokenManager.updateRotationConfig(strategy, requestCount);
    
    // Save to config.json
    const currentConfig = getConfigJson();
    if (!currentConfig.rotation) currentConfig.rotation = {};
    if (strategy) currentConfig.rotation.strategy = strategy;
    if (requestCount) currentConfig.rotation.requestCount = requestCount;
    saveConfigJson(currentConfig);
    
    // Reload config to memory
    reloadConfig();
    
    logger.info(`Rotation strategy updated: ${strategy || 'unchanged'}, request count: ${requestCount || 'unchanged'}`);
    res.json({ success: true, message: 'Rotation strategy updated', data: tokenManager.getRotationConfig() });
  } catch (error) {
    logger.error('Failed to update rotation config:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get model quotas for specific token
router.get('/tokens/:refreshToken/quotas', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.params;
    const forceRefresh = req.query.refresh === 'true';
    const tokens = await tokenManager.getTokenList();
    let tokenData = tokens.find(t => t.refresh_token === refreshToken);
    
    if (!tokenData) {
      return res.status(404).json({ success: false, message: 'Token not found' });
    }
    
    // Check if token expired, refresh if needed
    if (tokenManager.isExpired(tokenData)) {
      try {
        tokenData = await tokenManager.refreshToken(tokenData);
      } catch (error) {
        logger.error('Failed to refresh token:', error.message);
        // Use 400 instead of 401 to avoid frontend thinking JWT login expired
        return res.status(400).json({ success: false, message: 'Google Token expired and refresh failed, please re-login with Google account' });
      }
    }
    
    // Get from cache first (unless force refresh)
    let quotaData = forceRefresh ? null : quotaManager.getQuota(refreshToken);
    
    if (!quotaData) {
      // Cache miss or force refresh, get from API
      const token = { access_token: tokenData.access_token, refresh_token: refreshToken };
      const quotas = await getModelsWithQuotas(token);
      quotaManager.updateQuota(refreshToken, quotas);
      quotaData = { lastUpdated: Date.now(), models: quotas };
    }
    
    // Convert time to local timezone
    const modelsWithBeijingTime = {};
    Object.entries(quotaData.models).forEach(([modelId, quota]) => {
      modelsWithBeijingTime[modelId] = {
        remaining: quota.r,
        resetTime: quotaManager.convertToBeijingTime(quota.t),
        resetTimeRaw: quota.t
      };
    });
    
    res.json({ 
      success: true, 
      data: { 
        lastUpdated: quotaData.lastUpdated,
        models: modelsWithBeijingTime 
      } 
    });
  } catch (error) {
    logger.error('Failed to get quotas:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;