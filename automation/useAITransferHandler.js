const {
  callAIProvider,
  buildConversationHistory,
} = require("../functions/function");
const { getUserAISettings } = require("../routes/aiSettings");

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI customer assistant for this business. " +
  "Answer the customer's latest message using the chat history given below. " +
  "Keep replies concise, natural and in plain text. Do not use markdown.";

// The flow builder sends provider/model as autocomplete option objects
// like { id, name }. Normalise them to plain strings.
function pickId(value, fallback) {
  if (value == null || value === "") return fallback;
  return typeof value === "object" ? value?.id || value?.name || String(value) : value;
}

// Handles the flow-builder AI node. processAiTransfer calls this with:
//   aiTransferHandler(config = node.data, conversationArr = last N messages)
// config carries provider/apiKey/model/baseUrl when set by the flow; otherwise
// we fall back to the workspace's saved ai_settings. Requires config._uid.
async function aiTransferHandler(config = {}, conversationArr = []) {
  try {
    const uid = config?._uid;
    let provider = pickId(config?.provider, null);
    let apiKey = config?.apiKey;
    let baseUrl = config?.baseUrl;
    let model = pickId(config?.model, null);

    if (!apiKey && uid) {
      const saved = await getUserAISettings(uid);
      if (saved?.api_key) {
        apiKey = saved.api_key;
        provider = provider || saved.provider;
        baseUrl = baseUrl || saved.base_url;
        model = model || saved.model;
      }
    }

    if (!apiKey) {
      return {
        success: false,
        message:
          "AI is not configured. Add a provider API key in AI Settings or set one on this node.",
      };
    }

    const userPrompt = buildConversationHistory(
      conversationArr,
      Number(config?.messageReferenceCount) || 10,
    );

    const text = await callAIProvider({
      provider,
      apiKey,
      baseUrl,
      model,
      systemPrompt: config?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      userPrompt,
      temperature: config?.temperature,
      maxTokens: config?.maxTokens,
    });

    return { success: true, data: { message: String(text || "").trim() } };
  } catch (err) {
    return {
      success: false,
      message: err?.response?.data?.error?.message || err.message,
    };
  }
}

module.exports = { aiTransferHandler };