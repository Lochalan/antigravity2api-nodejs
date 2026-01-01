// Gemini 譬ｼ蠑剰ｽｬ謐｢蟾･蜈ｷ
import config from '../../config/config.js';
import { generateRequestId } from '../idGenerator.js';
import { convertGeminiToolsToAntigravity } from '../toolConverter.js';
import { getSignatureContext, createThoughtPart, modelMapping, isEnableThinking } from './common.js';
import { normalizeGeminiParameters, toGenerationConfig } from '../parameterNormalizer.js';

/**
 * 荳ｺ functionCall 逕滓・蜚ｯ荳 ID
 */
function generateFunctionCallId() {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 螟・炊 functionCall 蜥・functionResponse 逧・ID 蛹ｹ驟・
 */
function processFunctionCallIds(contents) {
  const functionCallIds = [];
  
  // 謾ｶ髮・園譛・functionCall 逧・ID
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

  // 荳ｺ functionResponse 蛻・・蟇ｹ蠎皮噪 ID
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
 * 螟・炊 model 豸域・荳ｭ逧・thought 蜥檎ｭｾ蜷・
 */
function processModelThoughts(content, reasoningSignature, toolSignature) {
  const parts = content.parts;
  
  // 譟･謇ｾ thought 蜥檎峡遶・thoughtSignature 逧・ｽ咲ｽｮ
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
  
  // 蜷亥ｹｶ謌匁ｷｻ蜉 thought 蜥檎ｭｾ蜷・
  if (thoughtIndex !== -1 && signatureIndex !== -1) {
    parts[thoughtIndex].thoughtSignature = signatureValue;
    parts.splice(signatureIndex, 1);
  } else if (thoughtIndex !== -1 && signatureIndex === -1) {
    if (reasoningSignature) parts[thoughtIndex].thoughtSignature = reasoningSignature;
  } else if (thoughtIndex === -1 && reasoningSignature) {
    parts.unshift(createThoughtPart(' ', reasoningSignature));
  }
  
  // 謾ｶ髮・峡遶狗噪遲ｾ蜷・parts・育畑莠・functionCall・・
  const standaloneSignatures = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.thoughtSignature && !part.thought && !part.functionCall && !part.text) {
      standaloneSignatures.unshift({ index: i, signature: part.thoughtSignature });
    }
  }
  
  // 荳ｺ functionCall 蛻・・遲ｾ蜷・
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
  
  // 遘ｻ髯､蟾ｲ菴ｿ逕ｨ逧・峡遶狗ｭｾ蜷・parts
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

  // 菴ｿ逕ｨ扈滉ｸ蜿よ焚隗・激蛹匁ｨ｡蝮怜､・炊 Gemini 譬ｼ蠑丞盾謨ｰ
  const normalizedParams = normalizeGeminiParameters(request.generationConfig || {});
  
  // 霓ｬ謐｢荳ｺ generationConfig 譬ｼ蠑・
  request.generationConfig = toGenerationConfig(normalizedParams, enableThinking, actualModelName);
  request.sessionId = token.sessionId;
  delete request.safetySettings;
  
  // 霓ｬ謐｢蟾･蜈ｷ螳壻ｹ・
  if (request.tools && Array.isArray(request.tools)) {
    request.tools = convertGeminiToolsToAntigravity(request.tools, token.sessionId, actualModelName);
  }
  
  // 豺ｻ蜉蟾･蜈ｷ驟咲ｽｮ
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



