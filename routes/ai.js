const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const randomstring = require("randomstring");
const validateUser = require("../middlewares/user.js");
const {
  getRecentMessages,
  suggestReplyWithOpenAI,
  suggestReplyWithGemini,
  suggestReplyWithDeepseek,
  suggestReplyWithOpenAICompatible,
  suggestReplyWithClaude,
  translateWithOpenAI,
  translateWithGemini,
  translateWithDeepseek,
  translateWithOpenAICompatible,
  translateWithClaude,
} = require("../functions/function.js");
const { getUserAISettings } = require("./aiSettings");
const logger = require("../utils/logger.js");

// Custom check function
const check = (field, message) => {
  return {
    field,
    message,
    notEmpty: function () {
      return this;
    },
  };
};

// Custom validationResult function
const validationResult = (req) => {
  return {
    isEmpty: () => !req.validationErrors || req.validationErrors.length === 0,
    array: () => req.validationErrors || [],
  };
};

// Validation middleware
const validate = (validations) => {
  return (req, res, next) => {
    const errors = [];

    validations.forEach((validation) => {
      const value = req.body[validation.field];
      if (!value || (typeof value === "string" && value.trim() === "")) {
        errors.push({
          field: validation.field,
          msg: validation.message,
        });
      }
    });

    req.validationErrors = errors;
    next();
  };
};

router.post(
  "/translate",
  validate([
    check("text", "Text is required").notEmpty(),
    check("targetLanguage", "Target language is required").notEmpty(),
    check("provider", "AI provider is required").notEmpty(),
  ]),
  validateUser,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    let { text, targetLanguage, provider, apiKey, baseUrl, model } = req.body;

    if (!apiKey) {
      const saved = await getUserAISettings(req.decode.uid);
      if (saved?.api_key) {
        apiKey = saved.api_key;
        baseUrl = baseUrl || saved.base_url;
        model = model || saved.model;
        provider = provider || saved.provider;
      }
    }

    try {
      let translatedText = "";

      switch (provider) {
        case "openai":
          translatedText = await translateWithOpenAI(
            text,
            targetLanguage,
            apiKey,
          );
          break;
        case "gemini":
          translatedText = await translateWithGemini(
            text,
            targetLanguage,
            apiKey,
          );
          break;
        case "deepseek":
          translatedText = await translateWithDeepseek(
            text,
            targetLanguage,
            apiKey,
          );
          break;
        case "claude":
          translatedText = await translateWithClaude(
            text,
            targetLanguage,
            apiKey,
            model,
          );
          break;
        case "openai_compatible":
          translatedText = await translateWithOpenAICompatible(
            text,
            targetLanguage,
            apiKey,
            baseUrl,
            model,
          );
          break;
        default:
          return res.json({
            success: false,
            msg: "Unsupported AI provider",
          });
      }

      return res.json({
        success: true,
        translatedText,
      });
    } catch (error) {
      logger.error("Translation error:", error);
      return res.json({
        success: false,
        msg: error.message || "Translation failed",
      });
    }
  },
);

router.post(
  "/suggest_reply",
  validate([
    check("chatId", "Chat ID is required").notEmpty(),
    check("provider", "AI provider is required").notEmpty(),
  ]),
  validateUser,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    let { chatId, lastMessage, provider, apiKey, baseUrl, model } = req.body;
    const { uid } = req.decode;

    if (!apiKey) {
      const saved = await getUserAISettings(uid);
      if (saved?.api_key) {
        apiKey = saved.api_key;
        baseUrl = baseUrl || saved.base_url;
        model = model || saved.model;
        provider = provider || saved.provider;
      }
    }

    try {
      // Get recent conversation messages for context
      const recentMessages = await getRecentMessages(chatId, uid, 5);

      let suggestion = "";

      switch (provider) {
        case "openai":
          suggestion = await suggestReplyWithOpenAI(
            recentMessages,
            lastMessage,
            apiKey,
          );
          break;
        case "gemini":
          suggestion = await suggestReplyWithGemini(
            recentMessages,
            lastMessage,
            apiKey,
          );
          break;
        case "deepseek":
          suggestion = await suggestReplyWithDeepseek(
            recentMessages,
            lastMessage,
            apiKey,
          );
          break;
        case "claude":
          suggestion = await suggestReplyWithClaude(
            recentMessages,
            lastMessage,
            apiKey,
            model,
          );
          break;
        case "openai_compatible":
          suggestion = await suggestReplyWithOpenAICompatible(
            recentMessages,
            lastMessage,
            apiKey,
            baseUrl,
            model,
          );
          break;
        default:
          return res.json({
            success: false,
            msg: "Unsupported AI provider",
          });
      }

      return res.json({
        success: true,
        suggestion,
      });
    } catch (error) {
      logger.error("Suggestion error:", error);
      return res.json({
        success: false,
        msg: error.message || "Failed to generate suggestion",
      });
    }
  },
);

module.exports = router;
