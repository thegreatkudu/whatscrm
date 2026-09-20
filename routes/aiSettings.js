const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const validateUser = require("../middlewares/user.js");
const logger = require("../utils/logger.js");
const {
  callOpenAICompatible,
  callAnthropic,
  callGemini,
  callDeepSeek,
} = require("../functions/function.js");

async function ensureAISettingsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS ai_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(64) DEFAULT NULL,
      provider VARCHAR(32) DEFAULT 'openai_compatible',
      api_key TEXT,
      base_url VARCHAR(255) DEFAULT NULL,
      model VARCHAR(100) DEFAULT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_uid (uid)
    )`,
  );
}

// Per-user AI credential resolver (mirrors the reference project's
// per-workspace CredentialResolver concept). Returns the stored row or null.
async function getUserAISettings(uid) {
  try {
    const rows = await query(
      `SELECT * FROM ai_settings WHERE uid = ? LIMIT 1`,
      [uid],
    );
    return rows?.[0] || null;
  } catch (err) {
    return null;
  }
}

ensureAISettingsTable().catch(() => {});

// Get the current user's saved AI settings (api_key is shown masked)
router.get("/get", validateUser, async (req, res) => {
  try {
    const row = await getUserAISettings(req.decode.uid);
    const settings = row
      ? { ...row, api_key: row.api_key ? "••••••••" : null }
      : null;
    res.json({ success: true, settings });
  } catch (err) {
    logger.error("Error getting AI settings:", err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// Save per-user AI provider credentials (used by all AI features:
// flow AI node, suggest reply, translate, future AI auto-reply)
router.post("/save", validateUser, async (req, res) => {
  try {
    const { provider, api_key, base_url, model, enabled } = req.body || {};
    if (!provider || !api_key) {
      return res.json({
        success: false,
        msg: "provider and api_key are required",
      });
    }

    await ensureAISettingsTable();

    const existing = await query(
      `SELECT id FROM ai_settings WHERE uid = ? LIMIT 1`,
      [req.decode.uid],
    );

    if (existing.length > 0) {
      await query(
        `UPDATE ai_settings
         SET provider = ?, api_key = ?, base_url = ?, model = ?, enabled = ?
         WHERE uid = ?`,
        [
          provider,
          api_key,
          base_url || null,
          model || null,
          enabled ? 1 : 0,
          req.decode.uid,
        ],
      );
    } else {
      await query(
        `INSERT INTO ai_settings (uid, provider, api_key, base_url, model, enabled)
         VALUES (?,?,?,?,?,?)`,
        [
          req.decode.uid,
          provider,
          api_key,
          base_url || null,
          model || null,
          enabled ? 1 : 0,
        ],
      );
    }

    res.json({ success: true, msg: "AI settings saved" });
  } catch (err) {
    logger.error("Error saving AI settings:", err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// Test a provider connection with the supplied (or saved) credentials
router.post("/test", validateUser, async (req, res) => {
  try {
    const body = req.body || {};
    let provider = body.provider;
    let apiKey = body.api_key;
    let baseUrl = body.base_url;
    let model = body.model;

    if (!apiKey) {
      const saved = await getUserAISettings(req.decode.uid);
      if (saved) {
        provider = provider || saved.provider;
        apiKey = saved.api_key;
        baseUrl = baseUrl || saved.base_url;
        model = model || saved.model;
      }
    }

    if (!provider || !apiKey) {
      return res.json({
        success: false,
        msg: "provider and api_key are required",
      });
    }

    let text = "";
    switch (provider) {
      case "claude":
        text = await callAnthropic(
          apiKey,
          model || "claude-3-5-sonnet-latest",
          "You are a connectivity test. Reply with exactly: OK",
          "Ping",
        );
        break;
      case "gemini":
        text = await callGemini(
          apiKey,
          model || "gemini-1.5-flash",
          "Reply with exactly: OK",
          "Ping",
        );
        break;
      case "deepseek":
        text = await callDeepSeek(
          apiKey,
          model || "deepseek-chat",
          "You are a connectivity test. Reply with exactly: OK",
          "Ping",
        );
        break;
      default:
        text = await callOpenAICompatible(
          apiKey,
          model || "gpt-3.5-turbo",
          "You are a connectivity test. Reply with exactly: OK",
          "Ping",
          baseUrl,
        );
        break;
    }

    res.json({ success: true, ok: String(text || "").trim() });
  } catch (err) {
    res.json({
      success: false,
      msg: err?.response?.data?.error?.message || err.message,
    });
  }
});

module.exports = router;
module.exports.getUserAISettings = getUserAISettings;
module.exports.ensureAISettingsTable = ensureAISettingsTable;