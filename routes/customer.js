const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const validateUser = require("../middlewares/user.js");
const logger = require("../utils/logger.js");
const customer = require("../helper/customer/index.js");

// List unified customers with their channel aliases and chat previews
router.get("/list", validateUser, async (req, res) => {
  try {
    const customers = await customer.getCustomers(req.decode.uid);
    res.json({ success: true, customers });
  } catch (err) {
    logger.error("Error listing customers:", err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// Chat history for one alias (origin + channel_id)
router.get("/chats", validateUser, async (req, res) => {
  try {
    const { origin, channel_id } = req.query;
    if (!origin || !channel_id) {
      return res.json({ success: false, msg: "origin and channel_id are required" });
    }

    const chats = await query(
      `SELECT * FROM beta_conversation
       WHERE uid = ? AND origin = ? AND senderMobile = ?
       ORDER BY timestamp DESC LIMIT 50`,
      [req.decode.uid, origin, channel_id],
    );

    const list = chats.map((row) => ({
      ...row,
      msgContext: row.msgContext ? JSON.parse(row.msgContext) : null,
      context: row.context ? JSON.parse(row.context) : null,
    }));

    res.json({ success: true, chats: list });
  } catch (err) {
    logger.error("Error listing customer chats:", err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// Manually link a channel alias to a customer by phone (creates customer if needed)
router.post("/merge", validateUser, async (req, res) => {
  try {
    const { origin, channel_id, phone, customer_id } = req.body || {};
    if (!origin || !channel_id) {
      return res.json({ success: false, msg: "origin and channel_id are required" });
    }

    let customerId = customer_id;
    if (!customerId && phone) {
      customerId = await customer.linkByChannel(
        req.decode.uid,
        origin,
        channel_id,
        phone,
      );
    }
    if (!customerId) {
      return res.json({
        success: false,
        msg: "customer_id or a phone number is required",
      });
    }

    if (customer_id) {
      await query(
        `UPDATE customer_alias SET customer_id = ?
         WHERE uid = ? AND origin = ? AND channel_id = ?`,
        [customer_id, req.decode.uid, origin, channel_id],
      );
    }

    res.json({ success: true, customer_id: customerId });
  } catch (err) {
    logger.error("Error merging customer:", err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// Break the link between a channel alias and a customer
router.post("/unmerge", validateUser, async (req, res) => {
  try {
    const { origin, channel_id } = req.body || {};
    await customer.unlink(req.decode.uid, origin, channel_id);
    res.json({ success: true });
  } catch (err) {
    logger.error("Error unmerging customer:", err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

// Rename / update a customer (name, email, notes)
router.post("/update", validateUser, async (req, res) => {
  try {
    const { customer_id, name, email, notes } = req.body || {};
    if (!customer_id) {
      return res.json({ success: false, msg: "customer_id is required" });
    }
    await query(
      `UPDATE customer SET name = COALESCE(?, name), email = COALESCE(?, email), notes = COALESCE(?, notes)
       WHERE id = ? AND uid = ?`,
      [name || null, email || null, notes || null, customer_id, req.decode.uid],
    );
    res.json({ success: true });
  } catch (err) {
    logger.error("Error updating customer:", err);
    res.json({ success: false, msg: "Something went wrong" });
  }
});

module.exports = router;