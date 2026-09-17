const http = require("http");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const {
  getDatabase,
  ref,
  onChildAdded,
  onChildChanged,
  get,
  set,
} = require("firebase/database");

const { initializeApp } = require("firebase/app");

// ===============================
// SHADOW X BOT CONFIG
// ===============================

const BOT_PHONE_NUMBER = "94766615142";
const CHANNEL_JID = "120363430002311340@newsletter";

const firebaseConfig = {
  databaseURL:
    "https://shadow-bot-access-68292-default-rtdb.firebaseio.com",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const PORT = process.env.PORT || 3000;

// ===============================
// HTTP SERVER
// ===============================

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    res.end("SHADOW X WhatsApp Bot is running.");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server running on port ${PORT}`);
  });

// ===============================
// HELPERS
// ===============================

function formatDate(timestamp) {
  if (!timestamp) return "Unknown";

  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Colombo",
  });
}

function formatTime(timestamp) {
  if (!timestamp) return "Unknown";

  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

function getStatus(user) {
  const expiresAt = Number(user.expiresAt || 0);
  const remaining = expiresAt - Date.now();

  if (remaining <= 0) return "expired";
  if (remaining <= 3 * 24 * 60 * 60 * 1000) return "soon";

  return "active";
}

function footer() {
  return "\n\n> *𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐒ʜᴀᴅᴏᴡ 👻*";
}

// ===============================
// NOTIFICATION STATE
// ===============================

async function notificationExists(key) {
  try {
    const snapshot = await get(
      ref(db, `whatsappNotifications/${key}`)
    );

    return snapshot.exists();
  } catch (error) {
    console.error("❌ Notification state error:", error.message);
    return false;
  }
}

async function saveNotification(key) {
  try {
    await set(
      ref(db, `whatsappNotifications/${key}`),
      {
        sentAt: Date.now(),
      }
    );
  } catch (error) {
    console.error(
      "❌ Could not save notification state:",
      error.message
    );
  }
}

// ===============================
// WHATSAPP BOT
// ===============================

let sock = null;
let reconnecting = false;

async function startBot() {
  try {
    console.log("🚀 SHADOW X WhatsApp Bot Starting...");

    const { state, saveCreds } =
      await useMultiFileAuthState("auth_info");

    console.log(
      `🔐 WhatsApp session registered: ${state.creds.registered}`
    );

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "info" }),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on("creds.update", saveCreds);

    let pairingRequested = false;

    sock.ev.on(
      "connection.update",
      async (update) => {
        const {
          connection,
          lastDisconnect,
        } = update;

        console.log(
          `📡 WhatsApp connection: ${
            connection || "update received"
          }`
        );

        // ===========================
        // PAIRING CODE
        // ===========================

        if (
          connection === "connecting" &&
          !state.creds.registered &&
          !pairingRequested
        ) {
          pairingRequested = true;

          console.log(
            "🔗 Requesting WhatsApp pairing code..."
          );

          try {
            // Small delay so socket can initialize
            await new Promise((resolve) =>
              setTimeout(resolve, 2000)
            );

            const code =
              await sock.requestPairingCode(
                BOT_PHONE_NUMBER
              );

            console.log(
              "========================================"
            );
            console.log(
              "🔗 WHATSAPP PAIRING CODE:"
            );
            console.log(code);
            console.log(
              "========================================"
            );
            console.log(
              "📱 Enter this code in WhatsApp → Linked Devices → Link with phone number"
            );
          } catch (error) {
            console.error(
              "❌ Pairing code error:",
              error
            );

            pairingRequested = false;
          }
        }

        // ===========================
        // CONNECTED
        // ===========================

        if (connection === "open") {
          console.log(
            "✅ WhatsApp connected successfully!"
          );

          console.log(
            `📢 Target Channel: ${CHANNEL_JID}`
          );
        }

        // ===========================
        // DISCONNECTED
        // ===========================

        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output
              ?.statusCode;

          console.log(
            "❌ WhatsApp connection closed.",
            statusCode || ""
          );

          if (
            statusCode !==
            DisconnectReason.loggedOut
          ) {
            console.log(
              "🔄 Reconnecting WhatsApp..."
            );

            if (!reconnecting) {
              reconnecting = true;

              setTimeout(async () => {
                reconnecting = false;
                await startBot();
              }, 5000);
            }
          } else {
            console.log(
              "⚠️ WhatsApp logged out. Delete auth_info and pair again."
            );
          }
        }
      }
    );

    setupFirebaseListeners();
  } catch (error) {
    console.error(
      "💥 Bot startup error:",
      error
    );

    setTimeout(startBot, 10000);
  }
}

// ===============================
// SEND CHANNEL MESSAGE
// ===============================

async function sendChannelMessage(message) {
  try {
    if (!sock) {
      console.log(
        "⚠️ WhatsApp socket is not ready."
      );
      return false;
    }

    if (!sock.user) {
      console.log(
        "⚠️ WhatsApp is not connected yet."
      );
      return false;
    }

    await sock.sendMessage(CHANNEL_JID, {
      text: message,
    });

    console.log(
      "📢 Channel message sent successfully."
    );

    return true;
  } catch (error) {
    console.error(
      "❌ Channel message failed:",
      error.message
    );

    return false;
  }
}

// ===============================
// NEW USER MESSAGE
// ===============================

async function notifyNewUser(user) {
  if (!user || !user.id) return;

  const key = `new_${user.id}`;

  if (await notificationExists(key)) {
    return;
  }

  const message =
    `✅ 𝗡𝗲𝘄 𝗨𝘀𝗲𝗿 𝗔𝗱𝗱𝗲𝗱 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆\n\n` +
    `👤 𝗡𝗮𝗺𝗲: ${user.name || "Unknown"}\n` +
    `📱 𝗡𝘂𝗺𝗯𝗲𝗿: ${user.phone || "Unknown"}\n` +
    `📅 𝗗𝗮𝘁𝗲: ${formatDate(
      user.createdAt
    )}\n` +
    `⏰ 𝗧𝗶𝗺𝗲: ${formatTime(
      user.createdAt
    )}\n` +
    `🟢 𝗦𝘁𝗮𝘁𝘂𝘀: Active` +
    footer();

  const sent = await sendChannelMessage(
    message
  );

  if (sent) {
    await saveNotification(key);
  }
}

// ===============================
// EXPIRING / EXPIRED
// ===============================

async function notifyStatus(user) {
  if (!user || !user.id) return;

  const status = getStatus(user);

  if (status === "soon") {
    const key = `soon_${user.id}_${user.expiresAt}`;

    if (await notificationExists(key)) {
      return;
    }

    const message =
      `⏳ 𝗨𝘀𝗲𝗿 𝗘𝘅𝗽𝗶𝗿𝗶𝗻𝗴 𝗦𝗼𝗼𝗻\n\n` +
      `👤 𝗡𝗮𝗺𝗲: ${user.name || "Unknown"}\n` +
      `📱 𝗡𝘂𝗺𝗯𝗲𝗿: ${user.phone || "Unknown"}\n` +
      `📅 𝗘𝘅𝗽𝗶𝗿𝗲𝘀: ${formatDate(
        user.expiresAt
      )}\n` +
      `⏰ 𝗧𝗶𝗺𝗲: ${formatTime(
        user.expiresAt
      )}` +
      footer();

    const sent =
      await sendChannelMessage(message);

    if (sent) {
      await saveNotification(key);
    }
  }

  if (status === "expired") {
    const key = `expired_${user.id}_${user.expiresAt}`;

    if (await notificationExists(key)) {
      return;
    }

    const message =
      `❌ 𝗨𝘀𝗲𝗿 𝗘𝘅𝗽𝗶𝗿𝗲𝗱\n\n` +
      `👤 𝗡𝗮𝗺𝗲: ${user.name || "Unknown"}\n` +
      `📱 𝗡𝘂𝗺𝗯𝗲𝗿: ${user.phone || "Unknown"}\n` +
      `📅 𝗘𝘅𝗽𝗶𝗿𝗲𝗱: ${formatDate(
        user.expiresAt
      )}\n` +
      `⏰ 𝗧𝗶𝗺𝗲: ${formatTime(
        user.expiresAt
      )}` +
      footer();

    const sent =
      await sendChannelMessage(message);

    if (sent) {
      await saveNotification(key);
    }
  }
}

// ===============================
// FIREBASE LISTENERS
// ===============================

let firebaseListenersStarted = false;

function setupFirebaseListeners() {
  if (firebaseListenersStarted) return;

  firebaseListenersStarted = true;

  console.log("🔥 Firebase listeners starting...");

  // New users
  onChildAdded(
    ref(db, "users"),
    async (snapshot) => {
      const user = snapshot.val();

      if (!user) return;

      console.log(
        `👤 Firebase user detected: ${
          user.name || user.id
        }`
      );

      // Give Firebase a moment on startup so old users
      // don't immediately trigger "new user" messages.
      if (!global.firebaseReady) {
        return;
      }

      await notifyNewUser(user);
    }
  );

  // User changes / renewals
  onChildChanged(
    ref(db, "users"),
    async (snapshot) => {
      const user = snapshot.val();

      if (!user) return;

      console.log(
        `🔄 Firebase user changed: ${
          user.name || user.id
        }`
      );

      await notifyStatus(user);
    }
  );

  // Initial Firebase load
  setTimeout(() => {
    global.firebaseReady = true;

    console.log(
      "🔥 Firebase initial load completed."
    );
  }, 5000);
}

// ===============================
// PERIODIC STATUS CHECK
// ===============================

async function scanUsers() {
  try {
    const snapshot = await get(
      ref(db, "users")
    );

    if (!snapshot.exists()) {
      console.log("👥 No users found.");
      return;
    }

    const users = snapshot.val();

    for (const id of Object.keys(users)) {
      await notifyStatus({
        ...users[id],
        id,
      });
    }

    console.log(
      `🔍 Status scan completed: ${
        Object.keys(users).length
      } users`
    );
  } catch (error) {
    console.error(
      "❌ Firebase scan error:",
      error.message
    );
  }
}

// Check every minute
setInterval(scanUsers, 60 * 1000);

// ===============================
// START
// ===============================

startBot();
