const { query } = require("../../database/dbpromise.js");

const STOP_WORDS = [
  "stopall",
  "stop",
  "unsubscribe",
  "unsub",
  "opt out",
  "optout",
  "quit",
  "end",
  "remove",
];

function matchStop(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;
  for (const word of STOP_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(^|[\\s,.;:!?]+)${escaped}([\\s,.;:!?]*$|$)`,
      "i",
    );
    if (re.test(t)) return word;
  }
  return null;
}

async function ensureOptOutTables() {
  try {
    await query(
      `ALTER TABLE contact ADD COLUMN unsubscribed TINYINT(1) NOT NULL DEFAULT 0`,
    );
  } catch (err) {
    // already exists
  }
  try {
    await query(
      `ALTER TABLE contact ADD COLUMN unsubscribed_at DATETIME DEFAULT NULL`,
    );
  } catch (err) {
    // already exists
  }
  await query(
    `CREATE TABLE IF NOT EXISTS opt_out_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(64) DEFAULT NULL,
      contact_id INT DEFAULT NULL,
      mobile VARCHAR(32) DEFAULT NULL,
      reason VARCHAR(255) DEFAULT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  );
}

async function processOptOut({ uid, mobile, reason }) {
  if (!uid || !mobile) return { success: false, msg: "Missing uid/mobile" };

  const found = await query(
    `SELECT id FROM contact WHERE uid = ? AND mobile = ? ORDER BY id DESC LIMIT 1`,
    [uid, mobile],
  );
  const contactId = found?.[0]?.id || null;

  await query(
    `UPDATE contact
     SET unsubscribed = 1, unsubscribed_at = NOW()
     WHERE uid = ? AND mobile = ?`,
    [uid, mobile],
  );

  await query(
    `INSERT INTO opt_out_log (uid, contact_id, mobile, reason) VALUES (?, ?, ?, ?)`,
    [uid, contactId, mobile, reason || "STOP keyword"],
  );

  return { success: true, contactId };
}

async function resubscribe({ uid, mobile }) {
  if (!uid || !mobile) return { success: false, msg: "Missing uid/mobile" };
  await query(
    `UPDATE contact SET unsubscribed = 0, unsubscribed_at = NULL WHERE uid = ? AND mobile = ?`,
    [uid, mobile],
  );
  return { success: true };
}

async function getOptOuts(uid) {
  const logs = await query(
    `SELECT id, contact_id, mobile, reason, createdAt
     FROM opt_out_log WHERE uid = ? ORDER BY id DESC LIMIT 500`,
    [uid],
  );
  const contacts = await query(
    `SELECT id, phonebook_id, name, mobile, unsubscribed_at
     FROM contact WHERE uid = ? AND unsubscribed = 1
     ORDER BY unsubscribed_at DESC LIMIT 500`,
    [uid],
  );
  return { logs, contacts };
}

module.exports = {
  matchStop,
  ensureOptOutTables,
  processOptOut,
  resubscribe,
  getOptOuts,
};