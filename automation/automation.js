const flowProcessor = require("./functions");
const { query } = require("../database/dbpromise");
const logger = require("../utils/logger");
const {
  callAIProvider,
  saveMessageToConversation,
  getCurrentTimestampInTimeZone,
  buildConversationHistory,
} = require("../functions/function");
const { getUserAISettings } = require("../routes/aiSettings");
const { sendWaMessage } = require("./functions");

async function processFlow({
  nodes,
  edges,
  uid,
  flowId,
  message,
  incomingText,
  user,
  sessionId,
  origin,
  chatId,
  element,
  webhookVariables = {},
  loopDetection = { visitedNodes: new Map(), startTime: Date.now() }, // Add loop detection
}) {
  // ===== LOOP PROTECTION START =====
  const MAX_ITERATIONS = 50; // Maximum total iterations
  const MAX_NODE_VISITS = 3; // Maximum visits to same node
  const MAX_EXECUTION_TIME = 30000; // 30 seconds max execution time

  // Check total execution time
  const executionTime = Date.now() - loopDetection.startTime;
  if (executionTime > MAX_EXECUTION_TIME) {
    logger.error("⚠️ Flow execution timeout - exceeded 30 seconds", {
      flowId,
      uid,
      senderMobile: message.senderMobile,
      executionTime,
    });

    // Clean up the session to prevent future issues
    await query(
      `DELETE FROM flow_session 
       WHERE uid = ? AND flow_id = ? AND sender_mobile = ?
       LIMIT 1`,
      [uid, flowId, message.senderMobile],
    );

    return logger.log("Flow terminated due to timeout");
  }

  // Check total iterations
  const totalIterations = Array.from(
    loopDetection.visitedNodes.values(),
  ).reduce((sum, count) => sum + count, 0);

  if (totalIterations >= MAX_ITERATIONS) {
    logger.error("⚠️ Infinite loop detected - exceeded max iterations", {
      flowId,
      uid,
      senderMobile: message.senderMobile,
      totalIterations,
      visitedNodes: Object.fromEntries(loopDetection.visitedNodes),
    });

    // Clean up the session
    await query(
      `DELETE FROM flow_session 
       WHERE uid = ? AND flow_id = ? AND sender_mobile = ?
       LIMIT 1`,
      [uid, flowId, message.senderMobile],
    );

    return logger.log("Flow terminated due to infinite loop");
  }
  // ===== LOOP PROTECTION END =====

  let result = { moveToNextNode: false };
  const flowSession = await flowProcessor.getFlowSession({
    flowId,
    message,
    uid,
    nodes,
    incomingText,
    edges,
    sessionId,
    origin,
    webhookVariables,
  });

  // returning if chat is disabled
  const checkIfDisabled = await flowProcessor.checkIfChatDisabled({
    flowSession,
  });

  if (checkIfDisabled && flowSession?.data?.disableChat?.timestamp) {
    return logger.log("Chat found disabled", { checkIfDisabled });
  }

  // checking if its assigned to ai
  const checkIfAssignedToAi = flowSession?.data?.assignedToAi;
  if (checkIfAssignedToAi) {
    logger.log("Chat is assigned to AI, ai flow processing");
    await flowProcessor.processAiTransfer({
      chatId,
      message,
      node: flowSession?.data?.assignedToAi?.node,
      origin,
      sessionId,
      user,
      nodes,
      edges,
      flowSession,
      element,
      variablesObj,
      incomingText,
    });
    return;
  }

  if (!flowSession?.data?.node && origin !== "webhook_automation") {
    logger.log(
      `[Flow] Corrupt/missing node in session — deleting and aborting. origin=${origin} flow=${flowId} sender=${message.senderMobile}`,
    );

    try {
      if (origin === "qr") {
        await query(
          `DELETE FROM flow_session WHERE uid = ? AND origin = ? AND origin_id = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
          [uid, origin, sessionId, flowId, message.senderMobile],
        );
      } else if (origin?.toLowerCase() === "webhook_automation") {
        await query(
          `DELETE FROM flow_session WHERE uid = ? AND origin = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
          [uid, origin, flowId, message.senderMobile],
        );
      } else if (
        origin?.toLowerCase() === "messenger" ||
        origin?.toLowerCase() === "instagram" ||
        origin?.toLowerCase() === "instagram_comment" ||
        origin?.toLowerCase() === "telegram"
      ) {
        await query(
          `DELETE FROM flow_session WHERE uid = ? AND origin = ? AND origin_id = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
          [uid, origin, sessionId, flowId, message.senderMobile],
        );
      } else {
        // meta default
        await query(
          `DELETE FROM flow_session WHERE uid = ? AND origin = ? AND origin_id = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
          [uid, "meta", "META", flowId, message.senderMobile],
        );
      }
    } catch (deleteErr) {
      logger.error("[Flow] Failed to delete corrupt session:", deleteErr);
    }

    // ✅ Hard stop — no recursion. Next message from user starts a clean session.
    return;
  }

  const { node: oldNode } = flowSession?.data;
  const variablesObj = flowSession?.data?.variables || {};

  // ===== TRACK NODE VISITS =====
  const currentNodeId = oldNode?.id;
  if (currentNodeId) {
    const visitCount = (loopDetection.visitedNodes.get(currentNodeId) || 0) + 1;
    loopDetection.visitedNodes.set(currentNodeId, visitCount);

    if (visitCount > MAX_NODE_VISITS) {
      logger.error(
        "⚠️ Infinite loop detected - same node visited too many times",
        {
          flowId,
          uid,
          senderMobile: message.senderMobile,
          nodeId: currentNodeId,
          nodeType: oldNode?.type,
          visitCount,
          allVisits: Object.fromEntries(loopDetection.visitedNodes),
        },
      );

      // Clean up the session
      await query(
        `DELETE FROM flow_session 
         WHERE uid = ? AND flow_id = ? AND sender_mobile = ?
         LIMIT 1`,
        [uid, flowId, message.senderMobile],
      );

      return logger.log(
        "Flow terminated - node visited too many times",
        flowId,
      );
    }
  }
  // ===== END TRACK NODE VISITS =====

  // updating variables
  let node;

  node = {
    ...oldNode,
    data: {
      ...oldNode?.data,
      content: flowProcessor.replaceVariables(
        oldNode?.data?.content,
        variablesObj,
      ),
    },
  };

  switch (node.type) {
    case "SEND_MESSAGE":
      result = await flowProcessor.processSendMessage({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "GOOGLE_SERVICE":
      result = await flowProcessor.processGoogleService({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "PHONEBOOK_MANAGER":
      result = await flowProcessor.processPhonebookManager({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SET_CHAT_LABEL":
      result = await flowProcessor.processSetChatLabel({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SEND_WA_FORM":
      result = await flowProcessor.processSendWaForm({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SEND_WA_TEMPLATE":
      result = await flowProcessor.processSendWaTemplate({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "CONDITION":
      result = await flowProcessor.processCondition({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "RESPONSE_SAVER":
      result = await flowProcessor.processResponseSaver({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "DISABLE_AUTOREPLY":
      result = await flowProcessor.processDisableAutoReply({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "MAKE_REQUEST":
      result = await flowProcessor.processMakeRequest({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "DELAY":
      result = await flowProcessor.processDelay({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SPREADSHEET":
      result = await flowProcessor.processSpreadSheet({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "EMAIL":
      result = await flowProcessor.processSendEmail({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "AGENT_TRANSFER":
      result = await flowProcessor.processAgentTransfer({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "AI_TRANSFER":
      result = await flowProcessor.processAiTransfer({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "MYSQL_QUERY":
      result = await flowProcessor.processMysqlQuery({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "RESET":
      result = await flowProcessor.processResetSession({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    default:
      break;
  }

  if (result?.moveToNextNode) {
    setTimeout(async () => {
      await processFlow({
        nodes,
        edges,
        uid,
        flowId: element.flow_id,
        message,
        incomingText,
        user,
        sessionId,
        origin,
        chatId,
        element,
        webhookVariables,
        loopDetection, // ✅ Pass loop detection to next iteration
      });
    }, 1000);
  }
}

const AI_AUTO_SYSTEM_PROMPT =
  "You are a helpful AI customer assistant for this business. " +
  "Answer the customer's latest message using the chat history below. " +
  "Keep replies short, friendly and in plain text. Never use markdown.";

// Admin-visible attempt log for the AI auto-reply fallback, so silent
// "not triggered" cases are diagnosable without server logs.
async function ensureAiReplyLogTable() {
  await query(`CREATE TABLE IF NOT EXISTS ai_auto_reply_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid VARCHAR(64) NULL,
    chat_id VARCHAR(255) NULL,
    origin VARCHAR(20) NULL,
    status VARCHAR(30) NULL,
    detail TEXT NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function logAiReply(uid, chatId, origin, status, detail) {
  try {
    await query(
      `INSERT INTO ai_auto_reply_log (uid, chat_id, origin, status, detail)
       VALUES (?, ?, ?, ?, ?)`,
      [uid || null, chatId || null, origin || null, status || null, detail || null],
    );
  } catch (err) {
    logger.log("[AI auto-reply log] failed to write:", err?.message);
  }
}

ensureAiReplyLogTable().catch(() => {});

// Global AI auto-reply fallback: fires when the user has no active flow for
// the channel. Uses the workspace's saved ai_settings and always opts out of
// waiving contacts who requested to be unsubscribed (WhatsApp).
async function aiAutoReply({ uid, message, user, sessionId, origin, chatId }) {
  try {
    if (message?.route && message?.route !== "INCOMING") return;

    if (origin === "meta") {
      const mobile = String(message?.senderMobile || "").replace(
        /[^0-9]/g,
        "",
      );
      if (mobile) {
        const optedOut = await query(
          `SELECT id FROM contact
           WHERE uid = ? AND unsubscribed = 1
             AND REPLACE(mobile, char(43), '') = ? LIMIT 1`,
          [uid, mobile],
        );
        if (optedOut?.[0]) {
          return logger.log("Skipped AI auto-reply for unsubscribed contact");
        }
      }
    }

    const settings = await getUserAISettings(uid);
    if (!settings?.api_key || Number(settings?.enabled) === 0) {
      await logAiReply(
        uid,
        chatId,
        origin,
        "skipped",
        !settings
          ? "no ai_settings row for uid"
          : Number(settings?.enabled) === 0
            ? "ai auto-reply disabled in AI settings"
            : "no api key saved",
      );
      return;
    }

    const recentRows = await query(
      `SELECT type, msgContext, route, timestamp
       FROM beta_conversation
       WHERE chat_id = ? AND uid = ?
       ORDER BY timestamp DESC LIMIT 12`,
      [chatId, uid],
    );

    const userPrompt = buildConversationHistory(recentRows?.reverse(), 12);

    let reply = "";
    try {
      reply = String(
        (await callAIProvider({
          provider: settings.provider,
          apiKey: settings.api_key,
          baseUrl: settings.base_url,
          model: settings.model,
          systemPrompt: AI_AUTO_SYSTEM_PROMPT,
          userPrompt,
        })) || "",
      ).trim();
    } catch (aiErr) {
      await logAiReply(
        uid,
        chatId,
        origin,
        "ai-error",
        String(aiErr?.message || aiErr),
      );
      return;
    }
    if (!reply) {
      await logAiReply(uid, chatId, origin, "empty", "provider returned empty reply");
      return;
    }

    const sendMsg = await sendWaMessage({
      origin,
      message,
      uid,
      isGroup: false,
      content: { type: "text", text: { preview_url: true, body: reply } },
    });

    if (!sendMsg) {
      await logAiReply(
        uid,
        chatId,
        origin,
        "send-failed",
        "sendWaMessage returned no id (likely missing messenger/insta page token or chat info)",
      );
      return;
    }

    await logAiReply(uid, chatId, origin, "sent", `replied to ${message.senderMobile}`);

    if (sendMsg) {
      const messageData = {
        type: "text",
        metaChatId: sendMsg,
        msgContext: { type: "text", text: { preview_url: true, body: reply } },
        reaction: "",
        timestamp:
          parseInt(
            getCurrentTimestampInTimeZone(user?.timezone || "Asia/Kolkata"),
          ) + 1,
        senderName: message.senderName,
        senderMobile: message.senderMobile,
        star: 0,
        route: "OUTGOING",
        context: null,
        origin,
      };

      await saveMessageToConversation({ uid, chatId, messageData, sentBy: "bot" });

      await query(
        `UPDATE beta_chats SET last_message = ? WHERE chat_id = ? AND uid = ?`,
        [JSON.stringify(messageData), chatId, uid],
      );

      logger.log(`[AI auto-reply] replied on ${origin} to ${message.senderMobile}`);
    }
  } catch (err) {
    logger.error("[AI auto-reply] error:", err);
  }
}

async function processAutomation({
  uid,
  message,
  user,
  sessionId,
  origin,
  chatId,
}) {
  const incomingText = flowProcessor.extractBodyText(message);

  const { senderMobile } = message;
  const userFlows = await flowProcessor.getActiveFlows({
    uid,
    origin,
    sessionId,
  });

  if (userFlows?.length < 1) {
    // No flow is handling this message — fall back to the saved AI settings
    // so the workspace can still auto-reply on any channel.
    await aiAutoReply({ uid, message, user, sessionId, origin, chatId });
    return logger.log("User does not have any active automation flow");
  }

  if (!senderMobile) {
    return logger.log("Invalid message found", message);
  }

  userFlows.forEach(async (element) => {
    try {
      const flowData = JSON.parse(element.data) || {};
      const nodes = flowData?.nodes || [];
      const edges = flowData?.edges || [];

      if (nodes?.length < 1 || edges?.length < 1) {
        return logger.log(
          "Either nodes or edges length is zero of this automation flow with id:",
          element.flow_id,
        );
      }

      await processFlow({
        nodes,
        edges,
        uid,
        flowId: element.flow_id,
        message,
        incomingText,
        user,
        sessionId,
        origin,
        chatId,
        element,
        loopDetection: { visitedNodes: new Map(), startTime: Date.now() },
      });
    } catch (err) {
      logger.log("[processAutomation] forEach error:", err); // ← ADD
    }
  });
}

async function processWebhookAutomation({ webhook, data }) {
  try {
    const { uid } = webhook;
    const userFlows = await flowProcessor.getActiveFlows({
      uid: webhook?.uid,
      origin: "webhook_automation",
      webhook,
    });

    if (userFlows?.length < 1) {
      return logger.log("User does not have any active automation flow");
    }

    const originData = userFlows[0]?.origin
      ? JSON.parse(userFlows[0]?.origin)
      : {};
    if (originData?.data?.webhook_id !== webhook?.webhook_id) {
      return logger.log("This was not for this webhook");
    }

    userFlows.forEach(async (element) => {
      try {
        const flowData = JSON.parse(element.data) || {};
        const nodes = flowData?.nodes || [];
        const edges = flowData?.edges || [];

        const initialNode = nodes?.find((x) => x.id === "initialNode");
        if (!initialNode) {
          return logger.log("Initial node not found in webhook hit");
        }

        const mobileNumberFromPath = flowProcessor.getNestedValue(
          initialNode?.data?.whPhonePath,
          data,
        );

        if (!mobileNumberFromPath) {
          return logger.log("No number was passed in the webhook");
        }

        const message = { senderMobile: mobileNumberFromPath };
        const { senderMobile } = message;

        if (!senderMobile || !uid) {
          return logger.log("Invalid webhook found", { message, webhook });
        }

        if (nodes?.length < 1 || edges?.length < 1) {
          return logger.log(
            "Either nodes or edges length is zero of this automation flow with id:",
            element.flow_id,
          );
        }

        const [user] = await query(`SELECT * FROM user WHERE uid = ? LIMIT 1`, [
          uid,
        ]);

        if (user) {
          await processFlow({
            nodes,
            edges,
            uid,
            flowId: element.flow_id,
            message,
            incomingText: "",
            user,
            sessionId: "",
            origin: "webhook_automation",
            chatId: "",
            element,
            webhookVariables: data || {},
            loopDetection: { visitedNodes: new Map(), startTime: Date.now() }, // ✅ Initialize
          });
        }
      } catch (err) {
        logger.log(err);
      }
    });
  } catch (err) {
    logger.log(err);
  }
}

module.exports = { processAutomation, processWebhookAutomation, processFlow };
