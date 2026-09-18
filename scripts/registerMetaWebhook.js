require("dotenv").config({ silent: true });
const { query } = require("../database/dbpromise.js");

const API_VERSION = process.env.META_API_VERSION || "v20.0";
const APP_ID = process.env.META_APP_ID || "";
const APP_SECRET = process.env.META_APP_SECRET || "";
const BACKURI = process.env.BACKURI || "";

async function main() {
  if (!APP_ID || !APP_SECRET) {
    console.error(
      "Missing META_APP_ID / META_APP_SECRET. Add them to Railway env (or .env) first.",
    );
    process.exit(1);
  }

  const appToken = `${APP_ID}|${APP_SECRET}`;

  const rows = await query(`SELECT * FROM meta_api ORDER BY id DESC LIMIT 1`, []);
  if (!rows || rows.length < 1) {
    console.error("No meta_api row found in the database.");
    process.exit(1);
  }

  const meta = rows[0];
  const uid = meta.uid;
  const wabaId = meta.waba_id;

  const callbackUrl =
    process.env.META_WEBHOOK_CALLBACK_URL || `${BACKURI}/api/inbox/webhook/${uid}`;
  const verifyToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN || uid;

  const fields =
    "messages,message_template_status_update,phone_number_name_update,phone_number_quality_update,account_update";

  console.log(`App ID:          ${APP_ID}`);
  console.log(`WABA ID:         ${wabaId}`);
  console.log(`Callback URL:    ${callbackUrl}`);
  console.log(`Verify Token:    ${verifyToken}`);
  console.log("");

  // ── Step 1: Register the callback URL at app level ──────────────────────
  console.log("[1/3] Registering app-level webhook subscription…");
  let res = await fetch(`https://graph.facebook.com/${API_VERSION}/${APP_ID}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: appToken,
      object: "whatsapp_business_account",
      callback_url: callbackUrl,
      verify_token: verifyToken,
      fields,
    }),
  });
  let data = await res.json();

  if (!res.ok || data?.error) {
    console.error("FAILED to register app subscription:", JSON.stringify(data));
    console.error(
      "\nManually test the endpoint first:\n  curl \"" + callbackUrl +
      "?hub.mode=subscribe&hub.verify_token=" + verifyToken + "&hub.challenge=HELLO\"" +
      "\nExpected response: HELLO\n" +
      "\nCommon causes: app in Development mode, wrong app secret, callback URL not reachable by Meta.",
    );
    process.exit(1);
  }
  console.log("  OK:", JSON.stringify(data));

  // ── Step 2: Subscribe the WABA to the app ───────────────────────────────
  console.log(`[2/3] Subscribing WABA ${wabaId}…`);
  let subData;
  let subRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${wabaId}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: appToken }),
    },
  );
  subData = await subRes.json();

  if (!subRes.ok || subData?.error) {
    // Fall back to the WABA user token stored in meta_api
    subRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${wabaId}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ access_token: meta.access_token }),
      },
    );
    subData = await subRes.json();
  }

  if (!subRes.ok || subData?.error) {
    console.error("FAILED to subscribe WABA:", JSON.stringify(subData));
    process.exit(1);
  }
  console.log("  OK:", JSON.stringify(subData));

  // ── Step 3: Verify ──────────────────────────────────────────────────────
  console.log("[3/3] Verifying subscription…");
  const checkRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${APP_ID}/subscriptions`,
    { headers: { Authorization: `Bearer ${appToken}` } },
  );
  const checkData = await checkRes.json();

  const subs = (checkData?.data || []).filter(
    (s) => s.object === "whatsapp_business_account",
  );
  if (subs.length === 0) {
    console.warn("No whatsapp_business_account subscription found in Meta.");
  } else {
    for (const s of subs) {
      const active = s.active === true || s.status === "active";
      const flds = (s.fields || []).map((f) => f.name).join(", ");
      console.log(`  Status:   ${active ? "active" : s.status}`);
      console.log(`  Callback: ${s.callback_url}`);
      console.log(`  Fields:   ${flds}`);
    }
  }

  console.log("\nDone. Test the endpoint:");
  console.log(`  curl "${callbackUrl}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=HELLO"`);
  console.log("  Expected response: HELLO");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});