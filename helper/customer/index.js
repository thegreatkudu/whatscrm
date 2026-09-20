const { query } = require("../../database/dbpromise");

let tablesReady = false;

// Unified customer identities across WhatsApp / Messenger / Instagram /
// Telegram. A `customer` is one person (identified by phone when known);
// `customer_alias` maps every channel id (phone, PSID, IG id, Telegram chat
// id) to that customer so the same person's chats can be merged and viewed
// across channels.
async function ensureCustomerTables() {
  if (tablesReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS customer (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(64) DEFAULT NULL,
      name VARCHAR(255) DEFAULT NULL,
      phone VARCHAR(64) DEFAULT NULL,
      email VARCHAR(255) DEFAULT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_customer_phone (uid, phone)
    )`,
  );
  await query(
    `CREATE TABLE IF NOT EXISTS customer_alias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT DEFAULT NULL,
      uid VARCHAR(64) DEFAULT NULL,
      origin VARCHAR(40) DEFAULT NULL,
      channel_id VARCHAR(128) DEFAULT NULL,
      sender_name VARCHAR(255) DEFAULT NULL,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_alias (uid, origin, channel_id),
      KEY idx_alias_customer (customer_id)
    )`,
  );
  tablesReady = true;
}

function digitsOnly(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

// Record an inbound conversation's channel id so we can later link channels
// from the same person. `phone` (digits) links/creates the unified customer.
// Never throws — captures are best-effort.
async function captureCustomerAlias({ uid, origin, channelId, senderName, phone }) {
  try {
    if (!uid || !origin || !channelId) return;
    await ensureCustomerTables();

    channelId = String(channelId).trim();
    const normalizedPhone = phone ? digitsOnly(phone) : null;

    let customerId = null;
    if (normalizedPhone) {
      const match = await query(
        `SELECT id FROM customer WHERE uid = ? AND phone = ? LIMIT 1`,
        [uid, normalizedPhone],
      );
      customerId = match?.[0]?.id || null;
      if (!customerId) {
        await query(
          `INSERT INTO customer (uid, name, phone) VALUES (?, ?, ?)`,
          [uid, senderName || null, normalizedPhone],
        );
        const created = await query(
          `SELECT id FROM customer WHERE uid = ? AND phone = ? LIMIT 1`,
          [uid, normalizedPhone],
        );
        customerId = created?.[0]?.id || null;
      }
    }

    const existing = await query(
      `SELECT id, customer_id FROM customer_alias
       WHERE uid = ? AND origin = ? AND channel_id = ? LIMIT 1`,
      [uid, origin, channelId],
    );

    if (existing?.[0]) {
      const current = existing[0];
      if (customerId && current.customer_id !== customerId) {
        await query(
          `UPDATE customer_alias
           SET customer_id = ?, sender_name = COALESCE(?, sender_name), last_seen = NOW()
           WHERE id = ?`,
          [customerId, senderName || null, current.id],
        );
      } else {
        await query(
          `UPDATE customer_alias
           SET sender_name = COALESCE(?, sender_name), last_seen = NOW()
           WHERE id = ?`,
          [senderName || null, current.id],
        );
      }
    } else {
      await query(
        `INSERT INTO customer_alias (customer_id, uid, origin, channel_id, sender_name)
         VALUES (?, ?, ?, ?, ?)`,
        [customerId, uid, origin, channelId, senderName || null],
      );
    }
  } catch (err) {
    // ignore — identity capture must never break message handling
  }
}

// Fetch customers with all their channel aliases and any matching chats.
async function getCustomers(uid) {
  await ensureCustomerTables();
  const customers = await query(
    `SELECT * FROM customer WHERE uid = ? ORDER BY updated_at DESC`,
    [uid],
  );
  for (const c of customers) {
    c.aliases = await query(
      `SELECT * FROM customer_alias WHERE customer_id = ? ORDER BY last_seen DESC`,
      [c.id],
    );
    let chatCount = 0;
    let lastMessage = null;
    let lastSeenAt = null;
    for (const a of c.aliases) {
      const chats = await query(
        `SELECT sender_name, last_message, updatedAt, createdAt
         FROM beta_chats
         WHERE uid = ? AND origin = ?
           AND (chat_id = ? OR sender_mobile = ?)
         ORDER BY createdAt DESC LIMIT 1`,
        [uid, a.origin, a.channel_id, a.channel_id],
      );
      if (chats?.[0]) {
        chatCount += 1;
        if (!lastMessage) lastMessage = chats[0].last_message;
        if (!lastSeenAt) lastSeenAt = chats[0].updatedAt || chats[0].createdAt;
      }
      a.lastMessage = chats?.[0]?.last_message || null;
      a.chatPreviewName = chats?.[0]?.sender_name || a.sender_name || null;
    }
    c.chatCount = chatCount;
    c.lastMessage = lastMessage;
    c.lastSeenAt = lastSeenAt;
  }
  return customers;
}

async function linkById(uid, aliasId, customerId) {
  await ensureCustomerTables();
  await query(
    `UPDATE customer_alias SET customer_id = ? WHERE id = ? AND uid = ?`,
    [customerId, aliasId, uid],
  );
}

async function linkByChannel(uid, origin, channelId, phone) {
  await ensureCustomerTables();
  const normalizedPhone = phone ? digitsOnly(phone) : null;
  if (!normalizedPhone) return null;

  let customerId = null;
  const match = await query(
    `SELECT id FROM customer WHERE uid = ? AND phone = ? LIMIT 1`,
    [uid, normalizedPhone],
  );
  customerId = match?.[0]?.id || null;
  if (!customerId) {
    await query(`INSERT INTO customer (uid, name, phone) VALUES (?, ?, ?)`, [
      uid,
      null,
      normalizedPhone,
    ]);
    const created = await query(
      `SELECT id FROM customer WHERE uid = ? AND phone = ? LIMIT 1`,
      [uid, normalizedPhone],
    );
    customerId = created?.[0]?.id || null;
  }

  await query(
    `UPDATE customer_alias SET customer_id = ?
     WHERE uid = ? AND origin = ? AND channel_id = ?`,
    [customerId, uid, origin, String(channelId).trim()],
  );
  return customerId;
}

async function unlink(uid, origin, channelId) {
  await ensureCustomerTables();
  await query(
    `UPDATE customer_alias SET customer_id = NULL
     WHERE uid = ? AND origin = ? AND channel_id = ?`,
    [uid, origin, String(channelId).trim()],
  );
}

module.exports = {
  ensureCustomerTables,
  captureCustomerAlias,
  getCustomers,
  linkById,
  linkByChannel,
  unlink,
  digitsOnly,
};