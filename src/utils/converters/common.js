// 霓ｬ謐｢蝎ｨ蜈ｬ蜈ｱ讓｡蝮・
import config from '../../config/config.js';
import { generateRequestId } from '../idGenerator.js';
import { getReasoningSignature, getToolSignature } from '../thoughtSignatureCache.js';
import { setToolNameMapping } from '../toolNameCache.js';
import { getThoughtSignatureForModel, getToolSignatureForModel, sanitizeToolName, modelMapping, isEnableThinking, generateGenerationConfig } from '../utils.js';

/**
 * 闔ｷ蜿也ｭｾ蜷堺ｸ贋ｸ区枚
 * @param {string} sessionId - 莨夊ｯ・ID
 * @param {string} actualModelName - 螳樣刔讓｡蝙句錐遘ｰ
 * @returns {Object} 蛹・性諤晉ｻｴ遲ｾ蜷榊柱蟾･蜈ｷ遲ｾ蜷咲噪蟇ｹ雎｡
 */
export function getSignatureContext(sessionId, actualModelName) {
  const cachedReasoningSig = getReasoningSignature(sessionId, actualModelName);
  const cachedToolSig = getToolSignature(sessionId, actualModelName);

  return {
    reasoningSignature: cachedReasoningSig || getThoughtSignatureForModel(actualModelName),
    toolSignature: cachedToolSig || getToolSignatureForModel(actualModelName)
  };
}

/**
 * 豺ｻ蜉逕ｨ謌ｷ豸域・蛻ｰ antigravityMessages
 * @param {Object} extracted - 謠仙叙逧・・螳ｹ { text, images }
 * @param {Array} antigravityMessages - 逶ｮ譬・ｶ域・謨ｰ扈・
 */
export function pushUserMessage(extracted, antigravityMessages) {
  antigravityMessages.push({
    role: 'user',
    parts: [{ text: extracted.text }, ...extracted.images]
  });
}

/**
 * 譬ｹ謐ｮ蟾･蜈ｷ隹・畑 ID 譟･謇ｾ蜃ｽ謨ｰ蜷・
 * @param {string} toolCallId - 蟾･蜈ｷ隹・畑 ID
 * @param {Array} antigravityMessages - 豸域・謨ｰ扈・
 * @returns {string} 蜃ｽ謨ｰ蜷・
 */
export function findFunctionNameById(toolCallId, antigravityMessages) {
  for (let i = antigravityMessages.length - 1; i >= 0; i--) {
    if (antigravityMessages[i].role === 'model') {
      const parts = antigravityMessages[i].parts;
      for (const part of parts) {
        if (part.functionCall && part.functionCall.id === toolCallId) {
          return part.functionCall.name;
        }
      }
    }
  }
  return '';
}

/**
 * 豺ｻ蜉蜃ｽ謨ｰ蜩榊ｺ泌芦 antigravityMessages
 * @param {string} toolCallId - 蟾･蜈ｷ隹・畑 ID
 * @param {string} functionName - 蜃ｽ謨ｰ蜷・
 * @param {string} resultContent - 蜩榊ｺ泌・螳ｹ
 * @param {Array} antigravityMessages - 逶ｮ譬・ｶ域・謨ｰ扈・
 */
export function pushFunctionResponse(toolCallId, functionName, resultContent, antigravityMessages) {
  const lastMessage = antigravityMessages[antigravityMessages.length - 1];
  const functionResponse = {
    functionResponse: {
      id: toolCallId,
      name: functionName,
      response: { output: resultContent }
    }
  };

  if (lastMessage?.role === 'user' && lastMessage.parts.some(p => p.functionResponse)) {
    lastMessage.parts.push(functionResponse);
  } else {
    antigravityMessages.push({ role: 'user', parts: [functionResponse] });
  }
}

/**
 * 蛻帛ｻｺ蟶ｦ遲ｾ蜷咲噪諤晉ｻｴ part
 * @param {string} text - 諤晉ｻｴ譁・悽
 * @param {string} signature - 遲ｾ蜷・
 * @returns {Object} 諤晉ｻｴ part
 */
export function createThoughtPart(text, signature = null) {
  const part = { text: text || ' ', thought: true };
  if (signature) part.thoughtSignature = signature;
  return part;
}

/**
 * 蛻帛ｻｺ蟶ｦ遲ｾ蜷咲噪蜃ｽ謨ｰ隹・畑 part
 * @param {string} id - 隹・畑 ID
 * @param {string} name - 蜃ｽ謨ｰ蜷搾ｼ亥ｷｲ貂・炊・・
 * @param {Object|string} args - 蜿よ焚
 * @param {string} signature - 遲ｾ蜷搾ｼ亥庄騾会ｼ・
 * @returns {Object} 蜃ｽ謨ｰ隹・畑 part
 */
export function createFunctionCallPart(id, name, args, signature = null) {
  const part = {
    functionCall: {
      id,
      name,
      args: typeof args === 'string' ? { query: args } : args
    }
  };
  if (signature) {
    part.thoughtSignature = signature;
  }
  return part;
}

/**
 * 螟・炊蟾･蜈ｷ蜷咲ｧｰ譏蟆・
 * @param {string} originalName - 蜴溷ｧ句錐遘ｰ
 * @param {string} sessionId - 莨夊ｯ・ID
 * @param {string} actualModelName - 螳樣刔讓｡蝙句錐遘ｰ
 * @returns {string} 貂・炊蜷守噪螳牙・蜷咲ｧｰ
 */
export function processToolName(originalName, sessionId, actualModelName) {
  const safeName = sanitizeToolName(originalName);
  if (sessionId && actualModelName && safeName !== originalName) {
    setToolNameMapping(sessionId, actualModelName, safeName, originalName);
  }
  return safeName;
}

/**
 * 豺ｻ蜉讓｡蝙区ｶ域・蛻ｰ antigravityMessages
 * @param {Object} options - 騾蛾｡ｹ
 * @param {Array} options.parts - 豸域・ parts
 * @param {Array} options.toolCalls - 蟾･蜈ｷ隹・畑 parts
 * @param {boolean} options.hasContent - 譏ｯ蜷ｦ譛画枚譛ｬ蜀・ｮｹ
 * @param {Array} antigravityMessages - 逶ｮ譬・ｶ域・謨ｰ扈・
 */
export function pushModelMessage({ parts, toolCalls, hasContent }, antigravityMessages) {
  const lastMessage = antigravityMessages[antigravityMessages.length - 1];
  const hasToolCalls = toolCalls && toolCalls.length > 0;

  if (lastMessage?.role === 'model' && hasToolCalls && !hasContent) {
    lastMessage.parts.push(...toolCalls);
  } else {
    const allParts = [...parts, ...(toolCalls || [])];
    antigravityMessages.push({ role: 'model', parts: allParts });
  }
  //console.log(JSON.stringify(antigravityMessages,null,2));
}

/**
 * 譫・ｻｺ蝓ｺ遑隸ｷ豎ゆｽ・
 * @param {Object} options - 騾蛾｡ｹ
 * @param {Array} options.contents - 豸域・蜀・ｮｹ
 * @param {Array} options.tools - 蟾･蜈ｷ蛻苓｡ｨ
 * @param {Object} options.generationConfig - 逕滓・驟咲ｽｮ
 * @param {string} options.sessionId - 莨夊ｯ・ID
 * @param {string} options.systemInstruction - 邉ｻ扈滓欠莉､
 * @param {Object} token - Token 蟇ｹ雎｡
 * @param {string} actualModelName - 螳樣刔讓｡蝙句錐遘ｰ
 * @returns {Object} 隸ｷ豎ゆｽ・
 */
export function buildRequestBody({ contents, tools, generationConfig, sessionId, systemInstruction }, token, actualModelName) {
  const requestBody = {
    project: token.projectId,
    requestId: generateRequestId(),
    request: {
      contents,
      tools: tools || [],
      toolConfig: { functionCallingConfig: { mode: 'VALIDATED' } },
      generationConfig,
      sessionId
    },
    model: actualModelName,
    userAgent: 'antigravity'
  };

  if (systemInstruction) {
    requestBody.request.systemInstruction = {
      role: 'user',
      parts: [{ text: systemInstruction }]
    };
  }

  return requestBody;
}

/**
 * 蜷亥ｹｶ邉ｻ扈滓欠莉､
 * @param {string} baseSystem - 蝓ｺ遑邉ｻ扈滓欠莉､
 * @param {string} contextSystem - 荳贋ｸ区枚邉ｻ扈滓欠莉､
 * @returns {string} 蜷亥ｹｶ蜷守噪邉ｻ扈滓欠莉､
 */
export function mergeSystemInstruction(baseSystem, contextSystem) {
  if (!config.useContextSystemPrompt || !contextSystem) {
    return baseSystem || '';
  }

  const parts = [];
  if (baseSystem && typeof baseSystem === 'string' && baseSystem.trim()) parts.push(baseSystem.trim());
  if (contextSystem && typeof contextSystem === 'string' && contextSystem.trim()) parts.push(contextSystem.trim());
  return parts.join('\n\n');
}

// 驥榊ｯｼ蜃ｺ蟶ｸ逕ｨ蜃ｽ謨ｰ
export { sanitizeToolName, modelMapping, isEnableThinking, generateGenerationConfig };

// 驥榊ｯｼ蜃ｺ蜿よ焚隗・激蛹門・謨ｰ
export {
  normalizeOpenAIParameters,
  normalizeClaudeParameters,
  normalizeGeminiParameters,
  normalizeParameters,
  toGenerationConfig
} from '../parameterNormalizer.js';

