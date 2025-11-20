import { randomUUID } from 'crypto';
import config from './config.js';

function generateRequestId() {
  return `agent-${randomUUID()}`;
}

function generateSessionId() {
  return String(-Math.floor(Math.random() * 9e18));
}

function generateProjectId() {
  const adjectives = ['useful', 'bright', 'swift', 'calm', 'bold'];
  const nouns = ['fuze', 'wave', 'spark', 'flow', 'core'];
  const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNum = Math.random().toString(36).substring(2, 7);
  return `${randomAdj}-${randomNoun}-${randomNum}`;
}
function openaiMessageToAntigravity(openaiMessages){
  return openaiMessages.map((message)=>{
    if (message.role === "user" || message.role === "system"){
      return {
        role: "user",
        parts: [
          {
            text: message.content
          }
        ]
      }
    }else if (message.role === "assistant"){
      return {
        role: "model",
        parts: [
          {
            text: message.content
          }
        ]
      }
    }
  })
}
function generateGenerationConfig(parameters, enableThinking, actualModelName){
  const generationConfig = {
    topP: parameters.top_p ?? config.defaults.top_p,
    topK: parameters.top_k ?? config.defaults.top_k,
    temperature: parameters.temperature ?? config.defaults.temperature,
    candidateCount: 1,
    maxOutputTokens: parameters.max_tokens ?? config.defaults.max_tokens,
    stopSequences: [
      "<|user|>",
      "<|bot|>",
      "<|context_request|>",
      "<|endoftext|>",
      "<|end_of_turn|>"
    ],
    thinkingConfig: {
      includeThoughts: enableThinking,
      thinkingBudget: enableThinking ? 1024 : 0
    }
  }
  if (enableThinking && actualModelName.includes("claude")){
    delete generationConfig.topP;
  }
  return generationConfig
}
function generateRequestBody(openaiMessages,modelName,parameters){
  const enableThinking = modelName.endsWith('-thinking') || 
    modelName === 'gemini-2.5-pro' || 
    modelName.startsWith('gemini-3-pro-') ||
    modelName === "rev19-uic3-1p" ||
    modelName === "gpt-oss-120b-medium"
  const actualModelName = modelName.endsWith('-thinking') ? modelName.slice(0, -9) : modelName;
  
  return{
    project: generateProjectId(),
    requestId: generateRequestId(),
    request: {
      contents: openaiMessageToAntigravity(openaiMessages),
      systemInstruction: {
        role: "user",
        parts: [{ text: config.systemInstruction }]
      },
      tools:[],
      toolConfig: {
        functionCallingConfig: {
          mode: "VALIDATED"
        }
      },
      generationConfig: generateGenerationConfig(parameters, enableThinking, actualModelName),
      sessionId: generateSessionId()
    },
    model: actualModelName,
    userAgent: "antigravity"
  }
}
export{
  generateRequestId,
  generateSessionId,
  generateProjectId,
  generateRequestBody
}
