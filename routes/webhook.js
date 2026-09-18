const router = require("express").Router();
const crypto = require("crypto");
const { query } = require("../database/dbpromise.js");
const validateUser = require("../middlewares/user.js");
const { checkPlan } = require("../middlewares/plan.js");
const { processWebhookAutomation } = require("../automation/automation.js");
const logger = require("../utils/logger.js");

function ensureTables() {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS webhook (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(64),
      webhook_id VARCHAR(64),
      name VARCHAR(255),
      description TEXT,
      method ENUM('GET','POST') DEFAULT 'POST',
      secret VARCHAR(255),
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS webhook_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(64),
      webhook_id VARCHAR(64),
      webhook_name VARCHAR(255),
      method VARCHAR(10),
      status VARCHAR(10),
      payload MEDIUMTEXT,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  Promise.all(sqls.map((s) => query(s, []))).catch((e) => logger.log(e));
}
ensureTables();

function genWebhookId() {
  return crypto.randomBytes(12).toString("hex");
}

function normalizeSecret(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  return body.secret;
}

async function logHit(webhook, method, status, payload) {
  try {
    await query(
      `INSERT INTO webhook_logs (uid, webhook_id, webhook_name, method, status, payload) VALUES (?,?,?,?,?,?)`,
      [
        webhook.uid,
        webhook.webhook_id,
        webhook.name || "",
        method,
        String(status),
        typeof payload === "string" ? payload : JSON.stringify(payload),
      ],
    );
  } catch (err) {
    logger.log(err);
  }
}

// ── Management: list / create / update / delete ───────────────────────────
router.get("/get_webhooks", validateUser, checkPlan, async (req, res) => {
  try {
    const data = await query(
      `SELECT * FROM webhook WHERE uid = ? ORDER BY id DESC`,
      [req.decode.uid],
    );
    res.json({ success: true, data });
  } catch (err) {
    logger.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

router.post("/add_webhook", validateUser, checkPlan, async (req, res) => {
  try {
    const { name, description, method, secret, is_active } = req.body;
    if (!name || !method) {
      return res.json({ success: false, msg: "Name and Method are required" });
    }

    const webhook_id = genWebhookId();
    const result = await query(
      `INSERT INTO webhook (uid, webhook_id, name, description, method, secret, is_active) VALUES (?,?,?,?,?,?,?)`,
      [
        req.decode.uid,
        webhook_id,
        name,
        description || "",
        method === "GET" ? "GET" : "POST",
        secret || "",
        is_active === 0 ? 0 : 1,
      ],
    );

    res.json({ success: true, msg: "Webhook created successfully", id: result.insertId });
  } catch (err) {
    logger.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

router.post("/update_webhook", validateUser, checkPlan, async (req, res) => {
  try {
    const { id, name, description, method, secret, is_active } = req.body;
    if (!id) {
      return res.json({ success: false, msg: "Webhook id is required" });
    }
    if (!name || !method) {
      return res.json({ success: false, msg: "Name and Method are required" });
    }

    await query(
      `UPDATE webhook SET name = ?, description = ?, method = ?, secret = ?, is_active = ? WHERE id = ? AND uid = ?`,
      [
        name,
        description || "",
        method === "GET" ? "GET" : "POST",
        secret || "",
        is_active === 0 ? 0 : 1,
        id,
        req.decode.uid,
      ],
    );

    res.json({ success: true, msg: "Webhook updated successfully" });
  } catch (err) {
    logger.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

router.post("/delete_webhook", validateUser, checkPlan, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.json({ success: false, msg: "Webhook id is required" });
    }

    const [hit] = await query(
      `SELECT webhook_id FROM webhook WHERE id = ? AND uid = ?`,
      [id, req.decode.uid],
    );
    await query(`DELETE FROM webhook WHERE id = ? AND uid = ?`, [
      id,
      req.decode.uid,
    ]);
    if (hit?.webhook_id) {
      await query(`DELETE FROM webhook_logs WHERE webhook_id = ?`, [
        hit.webhook_id,
      ]);
    }

    res.json({ success: true, msg: "Webhook deleted successfully" });
  } catch (err) {
    logger.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// ── Logs ───────────────────────────────────────────────────────────────────
router.get("/get_webhook_logs", validateUser, checkPlan, async (req, res) => {
  try {
    const data = await query(
      `SELECT * FROM webhook_logs WHERE uid = ? ORDER BY id DESC`,
      [req.decode.uid],
    );
    res.json({ success: true, data });
  } catch (err) {
    logger.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

router.post("/delete_webhook_logs", validateUser, checkPlan, async (req, res) => {
  try {
    const { logIds } = req.body;
    if (!Array.isArray(logIds) || logIds.length < 1) {
      return res.json({ success: false, msg: "No logs selected" });
    }

    const placeholders = logIds.map(() => "?").join(",");
    await query(
      `DELETE FROM webhook_logs WHERE id IN (${placeholders}) AND uid = ?`,
      [...logIds, req.decode.uid],
    );

    res.json({ success: true, msg: "Logs deleted successfully" });
  } catch (err) {
    logger.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// ── Public receiver (external services call this) ─────────────────────────
async function handleHit(req, res) {
  try {
    const { webhook_id } = req.params;

    const [webhook] = await query(
      `SELECT * FROM webhook WHERE webhook_id = ? LIMIT 1`,
      [webhook_id],
    );

    if (!webhook) {
      return res.status(404).json({ success: false, msg: "Webhook not found" });
    }
    if (!webhook.is_active) {
      return res.status(403).json({ success: false, msg: "Webhook is inactive" });
    }

    const method = (req.method || "GET").toUpperCase();

    if (webhook.secret) {
      const sent =
        req.headers["x-webhook-secret"] ||
        req.query.secret ||
        normalizeSecret(req.body);
      if (!sent || sent !== webhook.secret) {
        await logHit(webhook, method, 401, collectData(req));
        return res.status(401).json({ success: false, msg: "Invalid secret" });
      }
    }

    const data = collectData(req);

    await logHit(webhook, method, 200, data);

    processWebhookAutomation({
      webhook: { uid: webhook.uid, webhook_id: webhook.webhook_id },
      data,
    });

    res.json({ success: true });
  } catch (err) {
    logger.log(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
}

function collectData(req) {
  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      body = { raw: body };
    }
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { ...body, ...req.query };
  }
  return { ...req.query };
}

router.post("/webhook/:webhook_id", handleHit);
router.get("/webhook/:webhook_id", handleHit);

module.exports = router;