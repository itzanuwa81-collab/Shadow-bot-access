console.log("🔥 SHADOW X INDEX.JS STARTED 🔥");

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

// ========================================
// SHADOW X BOT CONFIG
// ========================================

const BOT_PHONE_NUMBER = "94766615142";
const CHANNEL_JID = "120363430002311340@newsletter";

const firebaseConfig = {
  databaseURL:
    "https://shadow-bot-access-68292-default-rtdb.firebaseio.com",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const PORT = process.env.PORT || 3000;

// ========================================
// HTTP SERVER
// ========================================

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

// ========================================
// DATE / TIME
// ========================================

function formatDate(timestamp) {
  if (!timestamp) return "Unknown";

  return new Date(timestamp).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

function formatTime(timestamp) {
  if (!timestamp) return "Unknown";

  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Colombo",
  });
}

// ========================================
// STATUS
// ========================================

function getStatus(user) {
  const expiresAt = Number(user.expiresAt || 0);
  const remaining = expiresAt - Date.now();

  if (remaining <= 0) {
    return "expired";
  }

  if (remaining <= 3 * 24 * 60 * 60 * 1000) {
    return "soon";
  }

  return "active";
}

// ========================================
// FOOTER
// ========================================

function footer() {
  return "\n\n> *𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐒ʜᴀᴅᴏᴡ 👻*";
}

// ========================================
// NOTIFICATION STATE
// ========================================

async function notificationExists(key) {
  try {
    const snapshot = await get(
      ref(db, `whatsappNotifications/${key}`)
    );

    return snapshot.exists();
  } catch (error) {
    console.error(
      "❌ Notification state error:",
      error.message
    );

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
      "❌ Notification save error:",
      error.message
    );
  }
}

// ========================================
// WHATSAPP
// ========================================

let sock = null;
let reconnecting = false;
let firebaseListenersStarted = false;

async function startBot() {
  try {
    console.log("");
    console.log("========================================");
    console.log("👻 SHADOW X BOT ACCESS SYSTEM");
    console.log("========================================");
    console.log("🚀 Starting WhatsApp bot...");
    console.log("📱 Bot:", BOT_PHONE_NUMBER);

    const { state, saveCreds } =
      await useMultiFileAuthState("auth_info");

    console.log(
      `🔐 WhatsApp registered: ${state.creds.registered}`
    );

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "info" }),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on("creds.update", saveCreds);

    let pairingRequested = false;

    // ========================================
    // PAIRING CODE
    // ========================================

    const requestPairing = async () => {
      if (state.creds.registered) {
        console.log(
          "ℹ️ WhatsApp session already registered."
        );
        return;
      }

      if (pairingRequested) {
        return;
      }

      pairingRequested = true;

      try {
        console.log("");
        console.log(
          "🔗 WhatsApp is not linked yet."
        );
        console.log(
          "⏳ Waiting for WhatsApp socket..."
        );

        await new Promise((resolve) =>
          setTimeout(resolve, 5000)
        );

        console.log(
          "🔐 Requesting pairing code..."
        );

        const code =
          await sock.requestPairingCode(
            BOT_PHONE_NUMBER
          );

        console.log("");
        console.log(
          "========================================"
        );
        console.log(
          "🔐 SHADOW X WHATSAPP PAIRING CODE"
        );
        console.log(
          "========================================"
        );
        console.log(`👉 ${code}`);
        console.log(
          "========================================"
        );
        console.log(
          "📱 WhatsApp → Settings"
        );
        console.log(
          "📱 → Linked Devices"
        );
        console.log(
          "📱 → Link a device"
        );
        console.log(
          "📱 → Link with phone number"
        );
        console.log(
          "========================================"
        );
        console.log("");
      } catch (error) {
        console.error(
          "❌ Pairing code error:",
          error?.message || error
        );

        pairingRequested = false;
      }
    };

    // Request shortly after socket creation.
    // This avoids depending only on the
    // "connecting" event timing.
    if (!state.creds.registered) {
      setTimeout(requestPairing, 3000);
    }

    // ========================================
    // CONNECTION UPDATE
    // ========================================

    sock.ev.on(
      "connection.update",
      async (update) => {
        const {
          connection,
          lastDisconnect,
        } = update;

        console.log(
          `📡 WhatsApp connection: ${
            connection || "update"
          }`
        );

        // Backup pairing request
        if (
          connection === "connecting" &&
          !state.creds.registered &&
          !pairingRequested
        ) {
          await requestPairing();
        }

        // ====================================
        // CONNECTED
        // ====================================

        if (connection === "open") {
          console.log("");
          console.log(
            "========================================"
          );
          console.log(
            "✅ WHATSAPP CONNECTED SUCCESSFULLY!"
          );
          console.log(
            "========================================"
          );
          console.log(
            `📢 Channel: ${CHANNEL_JID}`
          );
          console.log(
            "========================================"
          );
          console.log("");
        }

        // ====================================
        // DISCONNECTED
        // ====================================

        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output
              ?.statusCode;

          console.log(
            "❌ WhatsApp connection closed:",
            statusCode || "unknown"
          );

          if (
            statusCode !==
            DisconnectReason.loggedOut
          ) {
            if (!reconnecting) {
              reconnecting = true;

              console.log(
                "🔄 Reconnecting in 5 seconds..."
              );

              setTimeout(async () => {
                reconnecting = false;

                try {
                  await startBot();
                } catch (error) {
                  console.error(
                    "❌ Reconnect error:",
                    error.message
                  );
                }
              }, 5000);
            }
          } else {
            console.log(
              "⚠️ WhatsApp logged out."
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

// ========================================
// SEND CHANNEL MESSAGE
// ========================================

async function sendChannelMessage(message) {
  try {
    if (!sock) {
      console.log(
        "⚠️ WhatsApp socket not ready."
      );
      return false;
    }

    if (!sock.user) {
      console.log(
        "⚠️ WhatsApp not connected."
      );
      return false;
    }

    await sock.sendMessage(
      CHANNEL_JID,
      {
        text: message,
      }
    );

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

// ========================================
// NEW USER
// ========================================

async function notifyNewUser(user) {
  if (!user || !user.id) return;

  const key = `new_${user.id}`;

  if (await notificationExists(key)) {
    return;
  }

  const message =
    `✅ 𝗡𝗲𝘄 𝗨𝘀𝗲𝗿 𝗔𝗱𝗱𝗲𝗱 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆\n\n` +
    `*👤 Name :* ${user.name || "Unknown"}\n` +
    `*📞 Number :* ${user.phone || "Unknown"}\n` +
    `*📆 Date :* ${formatDate(user.createdAt)}\n` +
    `*⏰ Time :* ${formatTime(user.createdAt)}\n` +
    `*⚡ Status :* Active 🟢` +
    footer();

  const sent =
    await sendChannelMessage(message);

  if (sent) {
    await saveNotification(key);
  }
}

// ========================================
// EXPIRING / EXPIRED
// ========================================

async function notifyStatus(user) {
  if (!user || !user.id) return;

  const status = getStatus(user);

  // ======================================
  // EXPIRING SOON
  // ======================================

  if (status === "soon") {
    const key =
      `soon_${user.id}_${user.expiresAt}`;

    if (await notificationExists(key)) {
      return;
    }

    const message =
      `⏳ 𝗨𝘀𝗲𝗿 𝗘𝘅𝗽𝗶𝗿𝗶𝗻𝗴 𝗦𝗼𝗼𝗻\n\n` +
      `*👤 Name :* ${user.name || "Unknown"}\n` +
      `*📞 Number :* ${user.phone || "Unknown"}\n` +
      `*📆 Date :* ${formatDate(user.expiresAt)}\n` +
      `*⏰ Time :* ${formatTime(user.expiresAt)}\n` +
      `*⚡ Status :* Expiring Soon 🟡` +
      footer();

    const sent =
      await sendChannelMessage(message);

    if (sent) {
      await saveNotification(key);
    }
  }

  // ======================================
  // EXPIRED
  // ======================================

  if (status === "expired") {
    const key =
      `expired_${user.id}_${user.expiresAt}`;

    if (await notificationExists(key)) {
      return;
    }

    const message =
      `❌ 𝗨𝘀𝗲𝗿 𝗘𝘅𝗽𝗶𝗿𝗲𝗱\n\n` +
      `*👤 Name :* ${user.name || "Unknown"}\n` +
      `*📞 Number :* ${user.phone || "Unknown"}\n` +
      `*📆 Date :* ${formatDate(user.expiresAt)}\n` +
      `*⏰ Time :* ${formatTime(user.expiresAt)}\n` +
      `*⚡ Status :* Expired 🔴` +
      footer();

    const sent =
      await sendChannelMessage(message);

    if (sent) {
      await saveNotification(key);
    }
  }
}

// ========================================
// FIREBASE LISTENERS
// ========================================

function setupFirebaseListeners() {
  if (firebaseListenersStarted) {
    return;
  }

  firebaseListenersStarted = true;

  console.log(
    "🔥 Firebase listeners starting..."
  );

  // ======================================
  // NEW USERS
  // ======================================

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

      // Don't notify existing users
      // during first database load.
      if (!global.firebaseReady) {
        return;
      }

      await notifyNewUser(user);
    }
  );

  // ======================================
  // USER CHANGED / RENEWED
  // ======================================

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

  // ======================================
  // FIREBASE READY
  // ======================================

  setTimeout(() => {
    global.firebaseReady = true;

    console.log(
      "🔥 Firebase initial load completed."
    );
  }, 5000);
}

// ========================================
// PERIODIC EXPIRY CHECK
// ========================================

async function scanUsers() {
  try {
    const snapshot =
      await get(ref(db, "users"));

    if (!snapshot.exists()) {
      console.log(
        "👥 No users found."
      );
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

// Every minute
setInterval(
  scanUsers,
  60 * 1000
);

// ========================================
// START
// ========================================

startBot();
