// Gemini format converter
import config from '../../config/config.js';
import { generateRequestId } from '../idGenerator.js';
import { convertGeminiToolsToAntigravity } from '../toolConverter.js';
import { getSignatureContext, createThoughtPart, modelMapping, isEnableThinking } from './common.js';
import { normalizeGeminiParameters, toGenerationConfig } from '../parameterNormalizer.js';

/**
 * Generate unique ID for functionCall
 */
function generateFunctionCallId() {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Handle functionCall and functionResponse ID matching
 */
function processFunctionCallIds(contents) {
  const functionCallIds = [];
  
  // Collect all functionCall IDs
  contents.forEach(content => {
    if (content.role === 'model' && content.parts && Array.isArray(content.parts)) {
      content.parts.forEach(part => {
        if (part.functionCall) {
          if (!part.functionCall.id) {
            part.functionCall.id = generateFunctionCallId();
          }
          functionCallIds.push(part.functionCall.id);
        }
      });
    }
  });

  // Assign corresponding IDs to functionResponse
  let responseIndex = 0;
  contents.forEach(content => {
    if (content.role === 'user' && content.parts && Array.isArray(content.parts)) {
      content.parts.forEach(part => {
        if (part.functionResponse) {
          if (!part.functionResponse.id && responseIndex < functionCallIds.length) {
            part.functionResponse.id = functionCallIds[responseIndex];
            responseIndex++;
          }
        }
      });
    }
  });
}

/**
 * Process thought and signature in model messages
 */
function processModelThoughts(content, reasoningSignature, toolSignature) {
  const parts = content.parts;
  
  // Find thought and standalone thoughtSignature positions
  let thoughtIndex = -1;
  let signatureIndex = -1;
  let signatureValue = null;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.thought === true && !part.thoughtSignature) {
      thoughtIndex = i;
    }
    if (part.thoughtSignature && !part.thought) {
      signatureIndex = i;
      signatureValue = part.thoughtSignature;
    }
  }
  
  // Merge thought and signature if both exist
  // Don't inject placeholder thinking - it causes repetitive thinking blocks
  if (thoughtIndex !== -1 && signatureIndex !== -1) {
    parts[thoughtIndex].thoughtSignature = signatureValue;
    parts.splice(signatureIndex, 1);
  } else if (thoughtIndex !== -1 && signatureIndex === -1) {
    if (reasoningSignature) parts[thoughtIndex].thoughtSignature = reasoningSignature;
  }
  // Removed: Don't inject placeholder thought parts for messages that don't have thinking
  // The signature is still available via getSignatureContext for new generation
  
  // Collect standalone signature parts (for functionCall)
  const standaloneSignatures = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.thoughtSignature && !part.thought && !part.functionCall && !part.text) {
      standaloneSignatures.unshift({ index: i, signature: part.thoughtSignature });
    }
  }
  
  // Assign signatures to functionCall
  let sigIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.functionCall && !part.thoughtSignature) {
      if (sigIndex < standaloneSignatures.length) {
        part.thoughtSignature = standaloneSignatures[sigIndex].signature;
        sigIndex++;
      } else {
        if (toolSignature) part.thoughtSignature = toolSignature;
      }
    }
  }
  
  // Remove used standalone signature parts
  for (let i = standaloneSignatures.length - 1; i >= 0; i--) {
    if (i < sigIndex) {
      parts.splice(standaloneSignatures[i].index, 1);
    }
  }
}

export function generateGeminiRequestBody(geminiBody, modelName, token) {
  const enableThinking = isEnableThinking(modelName);
  const actualModelName = modelMapping(modelName);
  const request = JSON.parse(JSON.stringify(geminiBody));

  if (request.contents && Array.isArray(request.contents)) {
    processFunctionCallIds(request.contents);

    if (enableThinking) {
      const { reasoningSignature, toolSignature } = getSignatureContext(token.sessionId, actualModelName);
      
      request.contents.forEach(content => {
        if (content.role === 'model' && content.parts && Array.isArray(content.parts)) {
          processModelThoughts(content, reasoningSignature, toolSignature);
        }
      });
    }
  }

  // Use unified parameter normalizer for Gemini format
  const normalizedParams = normalizeGeminiParameters(request.generationConfig || {});
  
  // Convert to generationConfig format
  request.generationConfig = toGenerationConfig(normalizedParams, enableThinking, actualModelName);
  request.sessionId = token.sessionId;
  delete request.safetySettings;
  
  // Convert tool definitions
  if (request.tools && Array.isArray(request.tools)) {
    request.tools = convertGeminiToolsToAntigravity(request.tools, token.sessionId, actualModelName);
  }
  
  // Add tool configuration
  if (request.tools && request.tools.length > 0 && !request.toolConfig) {
    request.toolConfig = { functionCallingConfig: { mode: 'VALIDATED' } };
  }

  const existingText = request.systemInstruction?.parts?.[0]?.text || '';
  const mergedText = existingText ? `${config.systemInstruction}\n\n${existingText}` : config.systemInstruction ?? "";
  request.systemInstruction = {
    role: 'user',
    parts: [{ text: mergedText }]
  };
  
  //console.log(JSON.stringify(request, null, 2))

  const requestBody = {
    project: token.projectId,
    requestId: generateRequestId(),
    request: request,
    model: actualModelName,
    userAgent: 'antigravity'
  };

  return requestBody;
}
