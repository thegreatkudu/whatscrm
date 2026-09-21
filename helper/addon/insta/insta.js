const { query } = require("../../../database/dbpromise");
const fetch = require("node-fetch");

const API_VERSION = "v21.0";

function checkInsta() {
  return true;
}

async function genInstaWebhook() {
  try {
    const [admin] = await query(`SELECT * FROM admin LIMIT 1`, []);
    const webhook = `${process.env.BACKURI}/api/insta/webhook/${admin?.uid}`;
    return webhook;
  } catch (err) {
    return null;
  }
}

// ─── Add this function to your existing insta.js ──────────
// Subscribe the Instagram Business account to webhook fields. Per Meta docs
// this must go to /{ig-business-id}/subscribed_apps with the Page access token.
async function subscribeInstaWebhook(accessToken, igBusinessId) {
  const SUBSCRIBED_FIELDS = [
    "messages",
    "messaging_seen",
    "comments",
    "messaging_postbacks",
    "messaging_optins",
    "messaging_referral",
    "message_reactions",
  ].join(",");

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${igBusinessId}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          subscribed_fields: SUBSCRIBED_FIELDS,
          access_token: accessToken,
        }),
      },
    );
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("[Instagram] subscribeInstaWebhook error:", err.message);
    return null;
  }
}

async function getInstaCallbackUri() {
  try {
    const callBackUri = `${process.env.BACKURI}/api/insta/callback`;
    return callBackUri;
  } catch (err) {
    return null;
  }
}

// Exchange the Facebook-Login authorization code for a short-lived Facebook
// user access token (Instagram Login with Facebook).
async function exchangeShortToken({ appId, appSecret, redirectUri, code }) {
  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    },
  );
  return res.json();
}

// Extend the short-lived Facebook user token to a long-lived one.
async function exchangeLongToken({ appId, appSecret, shortToken }) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token?${params.toString()}`,
  );
  return res.json();
}

// Discover the linked Facebook Page with an Instagram Business Account and
// return the IG profile data plus the Page access token (used for IG
// messaging / media / webhooks on graph.facebook.com).
async function fetchInstaProfile(token) {
  const accountsRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${token}`,
  );
  const accountsData = await accountsRes.json();
  const pages = accountsData?.data || [];

  const page = pages.find((p) => p?.instagram_business_account);
  if (!page) {
    throw new Error(
      "No Facebook Page with an Instagram Business account was found. " +
        "Link an Instagram professional account to a Page first.",
    );
  }

  const ig = page.instagram_business_account;
  return {
    id: String(ig.id),
    username: ig.username,
    name: ig.name || page.name,
    profile_picture_url: ig.profile_picture_url || "",
    page_id: String(page.id),
    page_access_token: page.access_token,
  };
}

module.exports = {
  checkInsta,
  genInstaWebhook,
  exchangeShortToken,
  exchangeLongToken,
  fetchInstaProfile,
  API_VERSION,
  getInstaCallbackUri,
  subscribeInstaWebhook,
};
