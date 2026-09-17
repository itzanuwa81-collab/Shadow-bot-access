const http = require("http");

const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const { initializeApp } = require("firebase/app");
const {
  getDatabase,
  ref,
  get,
  set,
  onChildAdded,
  onChildChanged
} = require("firebase/database");

const pino = require("pino");

// ========================================
// SHADOW X BOT CONFIG
// ========================================

const TARGET_CHANNEL_JID = "120363430002311340@newsletter";
const BOT_PHONE_NUMBER = "94766615142";

// ========================================
// FIREBASE
// ========================================

const firebaseConfig = {
  databaseURL:
    "https://shadow-bot-access-68292-default-rtdb.firebaseio.com/"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ========================================
// WEB SERVER
// Required for cloud hosting
// ========================================

const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain"
    });

    res.end("SHADOW X WhatsApp Bot is running ✅");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server running on port ${PORT}`);
  });

// ========================================
// BOT
// ========================================

let sock = null;
let firebaseStarted = false;

// ========================================
// DATE / TIME
// ========================================

function formatDateTime(value) {
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return {
      date: "N/A",
      time: "N/A"
    };
  }

  const date = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(d);

  return {
    date,
    time
  };
}

// ========================================
// STATUS
// ========================================

function statusOf(user) {
  if (!user || !user.expiresAt) {
    return "unknown";
  }

  const expires = new Date(user.expiresAt).getTime();

  if (!Number.isFinite(expires)) {
    return "unknown";
  }

  const difference = expires - Date.now();

  if (difference <= 0) {
    return "expired";
  }

  // 3 days
  if (difference <= 3 * 24 * 60 * 60 * 1000) {
    return "soon";
  }

  return "active";
}

// ========================================
// FIREBASE NOTIFICATION STATE
// ========================================

async function alreadySent(key) {
  try {
    const snapshot = await get(
      ref(db, `whatsappNotifications/${key}`)
    );

    return snapshot.exists();
  } catch (error) {
    console.error("Notification state error:", error);
    return false;
  }
}

async function markSent(key, type, user) {
  try {
    await set(
      ref(db, `whatsappNotifications/${key}`),
      {
        type: type,
        userId: user.id || key,
        name: user.name || "N/A",
        phone: user.phone || "N/A",
        sentAt: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error("Could not save notification state:", error);
  }
}

// ========================================
// SEND MESSAGE
// ========================================

async function sendChannel(message) {
  if (!sock) {
    console.log("⚠️ WhatsApp socket is not ready.");
    return;
  }

  try {
    await sock.sendMessage(
      TARGET_CHANNEL_JID,
      {
        text: message
      }
    );

    console.log("✅ Channel message sent.");
  } catch (error) {
    console.error("❌ Channel message error:", error);
  }
}

// ========================================
// NEW USER MESSAGE
// ========================================

function newUserMessage(user) {
  const {
    date,
    time
  } = formatDateTime(
    user.createdAt || Date.now()
  );

  return `✅ 𝗡𝗲𝘄 𝗨𝘀𝗲𝗿 𝗔𝗱𝗱𝗲𝗱 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆

*👤 Name :* ${user.name || "N/A"}
*📞 Number :* ${user.phone || "N/A"}
*📆 Date :* ${date}
*⏰ Time :* ${time}
*⚡ Status :* Active 🟢

> *𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐒ʜᴀᴅᴏᴡ 👻*`;
}

// ========================================
// EXPIRING SOON MESSAGE
// ========================================

function soonMessage(user) {
  const {
    date,
    time
  } = formatDateTime(Date.now());

  return `⏳ 𝗨𝘀𝗲𝗿 𝗘𝘅𝗽𝗶𝗿𝗶𝗻𝗴 𝗦𝗼𝗼𝗻

*👤 Name :* ${user.name || "N/A"}
*📞 Number :* ${user.phone || "N/A"}
*📆 Date :* ${date}
*⏰ Time :* ${time}
*⚡ Status :* Expiring Soon 🟡

> *𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐒ʜᴀᴅᴏᴡ 👻*`;
}

// ========================================
// EXPIRED MESSAGE
// ========================================

function expiredMessage(user) {
  const {
    date,
    time
  } = formatDateTime(Date.now());

  return `❌ 𝗨𝘀𝗲𝗿 𝗘𝘅𝗽𝗶𝗿𝗲𝗱

*👤 Name :* ${user.name || "N/A"}
*📞 Number :* ${user.phone || "N/A"}
*📆 Date :* ${date}
*⏰ Time :* ${time}
*⚡ Status :* Expired 🔴

> *𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐒ʜᴀᴅᴏᴡ 👻*`;
}

// ========================================
// CHECK EXPIRY
// ========================================

async function processExpiry(user, key) {
  if (!user || !user.expiresAt) {
    return;
  }

  const status = statusOf(user);

  // ----------------------------
  // EXPIRING SOON
  // ----------------------------

  if (status === "soon") {
    const notificationKey = `${key}_soon`;

    if (!(await alreadySent(notificationKey))) {
      await sendChannel(
        soonMessage(user)
      );

      await markSent(
        notificationKey,
        "soon",
        user
      );
    }
  }

  // ----------------------------
  // EXPIRED
  // ----------------------------

  if (status === "expired") {
    const notificationKey = `${key}_expired`;

    if (!(await alreadySent(notificationKey))) {
      await sendChannel(
        expiredMessage(user)
      );

      await markSent(
        notificationKey,
        "expired",
        user
      );
    }
  }
}

// ========================================
// FIREBASE WATCHER
// ========================================

function startFirebaseWatcher() {
  if (firebaseStarted) {
    return;
  }

  firebaseStarted = true;

  const usersRef = ref(db, "users");

  console.log("🔥 Starting Firebase watcher...");

  // --------------------------------------
  // NEW USER
  // --------------------------------------

  let initialLoading = true;

  onChildAdded(
    usersRef,
    async (snapshot) => {
      const user = snapshot.val();
      const key = snapshot.key;

      if (!key || !user) {
        return;
      }

      // Existing users when bot starts are ignored.
      if (initialLoading) {
        return;
      }

      const notificationKey = `${key}_added`;

      try {
        if (
          await alreadySent(
            notificationKey
          )
        ) {
          return;
        }

        await sendChannel(
          newUserMessage(user)
        );

        await markSent(
          notificationKey,
          "added",
          user
        );

      } catch (error) {
        console.error(
          "New user notification error:",
          error
        );
      }
    }
  );

  // Give Firebase time to send existing users.
  setTimeout(() => {
    initialLoading = false;

    console.log(
      "👀 Firebase watcher ready."
    );
  }, 5000);

  // --------------------------------------
  // USER CHANGED
  // --------------------------------------

  onChildChanged(
    usersRef,
    async (snapshot) => {
      const user = snapshot.val();
      const key = snapshot.key;

      if (!key || !user) {
        return;
      }

      try {
        await processExpiry(
          user,
          key
        );
      } catch (error) {
        console.error(
          "Expiry change error:",
          error
        );
      }
    }
  );

  // --------------------------------------
  // PERIODIC EXPIRY CHECK
  // --------------------------------------

  setInterval(
    async () => {
      try {
        const snapshot =
          await get(usersRef);

        if (!snapshot.exists()) {
          return;
        }

        const users =
          snapshot.val();

        for (
          const [key, user]
          of Object.entries(users)
        ) {
          await processExpiry(
            user,
            key
          );
        }

      } catch (error) {
        console.error(
          "Expiry scan error:",
          error
        );
      }
    },
    60 * 1000
  );

  console.log(
    "⏰ Expiry checker started."
  );
}

// ========================================
// WHATSAPP BOT START
// ========================================

async function startBot() {
  try {
    console.log(
      "🚀 Starting SHADOW X WhatsApp Bot..."
    );

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      "auth_info"
    );

    sock = makeWASocket({
      auth: state,

      logger: pino({
        level: "silent"
      }),

      printQRInTerminal: false,

      markOnlineOnConnect: false
    });

    // Save WhatsApp login credentials.
    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // ------------------------------------
    // CONNECTION
    // ------------------------------------

    sock.ev.on(
      "connection.update",
      async ({
        connection,
        lastDisconnect
      }) => {

        // ================================
        // CONNECTED
        // ================================

        if (connection === "open") {

          console.log(
            "================================"
          );

          console.log(
            "✅ WHATSAPP BOT CONNECTED"
          );

          console.log(
            "📢 Channel:",
            TARGET_CHANNEL_JID
          );

          console.log(
            "================================"
          );

          startFirebaseWatcher();
        }

        // ================================
        // CLOSED
        // ================================

        if (connection === "close") {

          const code =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          const reconnect =
            code !==
            DisconnectReason.loggedOut;

          console.log(
            "⚠️ WhatsApp connection closed."
          );

          console.log(
            "🔄 Reconnect:",
            reconnect
          );

          if (reconnect) {

            setTimeout(
              () => {
                startBot();
              },
              5000
            );

          } else {

            console.log(
              "❌ WhatsApp logged out."
            );

            console.log(
              "Delete auth_info and pair again."
            );
          }
        }
      }
    );

    // ------------------------------------
    // PAIRING CODE
    // ------------------------------------

    if (!state.creds.registered) {

      console.log(
        "📱 WhatsApp account needs pairing."
      );

      setTimeout(
        async () => {

          try {

            const code =
              await sock.requestPairingCode(
                BOT_PHONE_NUMBER
              );

            console.log(
              "================================"
            );

            console.log(
              "🔗 WHATSAPP PAIRING CODE:"
            );

            console.log(code);

            console.log(
              "================================"
            );

            console.log(
              "WhatsApp → Linked devices →"
            );

            console.log(
              "Link a device →"
            );

            console.log(
              "Link with phone number"
            );

          } catch (error) {

            console.error(
              "❌ Pairing code error:",
              error
            );
          }

        },
        4000
      );
    }

  } catch (error) {

    console.error(
      "❌ Bot startup error:",
      error
    );

    setTimeout(
      startBot,
      10000
    );
  }
}

// ========================================
// START
// ========================================

startBot();
