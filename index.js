const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, onChildAdded, onChildChanged, onChildRemoved } = require("firebase/database");
const pino = require("pino");

// ===============================
// SHADOW X BOT CONFIG
// ===============================
const TARGET_CHANNEL_JID = "120363430002311340@newsletter";
const BOT_PHONE_NUMBER = "94766615142";

const firebaseConfig = {
  databaseURL: "https://shadow-bot-access-68292-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let sock;
let listenersStarted = false;

// Prevent duplicate notifications after a bot restart.
// These are local to this bot instance and are also persisted in Firebase.
const notificationRef = ref(db, "whatsappNotifications");

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";

  const date = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d);

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true
  }).format(d);

  return { date, time };
}

function statusOf(user) {
  const expires = new Date(user.expiresAt).getTime();
  if (!Number.isFinite(expires)) return "unknown";

  const diff = expires - Date.now();
  if (diff <= 0) return "expired";
  if (diff <= 3 * 24 * 60 * 60 * 1000) return "soon";
  return "active";
}

function userKey(snapshot) {
  return snapshot.key || snapshot.val()?.id;
}

async function alreadySent(key) {
  const { get } = require("firebase/database");
  const snap = await get(ref(db, `whatsappNotifications/${key}`));
  return snap.exists();
}

async function markSent(key, type, user) {
  const { set } = require("firebase/database");
  await set(ref(db, `whatsappNotifications/${key}`), {
    type,
    userId: user.id || key,
    name: user.name || "N/A",
    phone: user.phone || "N/A",
    sentAt: new Date().toISOString()
  });
}

async function sendChannel(text) {
  if (!sock) return;
  await sock.sendMessage(TARGET_CHANNEL_JID, { text });
  console.log("✅ Channel update sent.");
}

function newUserMessage(user) {
  const { date, time } = formatDateTime(user.createdAt || Date.now());
  return `✅ 𝗡𝗲𝘄 𝗨𝘀𝗲𝗿 𝗔𝗱𝗱𝗲𝗱 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆

*👤 Name :* ${user.name || "N/A"}
*📞 Number :* ${user.phone || "N/A"}
*📆 Date :* ${date}
*⏰ Time :* ${time}
*⚡ Status :* Active 🟢

> *𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐒ʜᴀᴅᴏᴡ 👻*`;
}

function soonMessage(user) {
  const { date, time } = formatDateTime(Date.now());
  return `⏳ 𝗨𝘀𝗲𝗿 𝗘𝘅𝗽𝗶𝗿𝗶𝗻𝗴 𝗦𝗼𝗼𝗻

*👤 Name :* ${user.name || "N/A"}
*📞 Number :* ${user.phone || "N/A"}
*📆 Date :* ${date}
*⏰ Time :* ${time}
*⚡ Status :* Expiring Soon 🟡

> *𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐒ʜᴀᴅᴏᴡ 👻*`;
}

function expiredMessage(user) {
  const { date, time } = formatDateTime(Date.now());
  return `❌ 𝗨𝘀𝗲𝗿 𝗘𝘅𝗽𝗶𝗿𝗲𝗱

*👤 Name :* ${user.name || "N/A"}
*📞 Number :* ${user.phone || "N/A"}
*📆 Date :* ${date}
*⏰ Time :* ${time}
*⚡ Status :* Expired 🔴

> *𝐏ᴏᴡᴇʀᴇᴅ 𝐁ʏ 𝐒ʜᴀᴅᴏᴡ 👻*`;
}

async function processExpiry(user, key) {
  if (!user || !user.expiresAt) return;

  const status = statusOf(user);

  if (status === "soon") {
    const notificationKey = `${key}_soon`;
    if (!(await alreadySent(notificationKey))) {
      await sendChannel(soonMessage(user));
      await markSent(notificationKey, "soon", user);
    }
  }

  if (status === "expired") {
    const notificationKey = `${key}_expired`;
    if (!(await alreadySent(notificationKey))) {
      await sendChannel(expiredMessage(user));
      await markSent(notificationKey, "expired", user);
    }
  }
}

function listenFirebaseChanges() {
  if (listenersStarted) return;
  listenersStarted = true;

  const usersRef = ref(db, "users");

  // Important:
  // Existing users loaded when the listener first starts are NOT announced
  // as "new". Only users added after the bot has started get this message.
  let initialLoad = true;
  const initialKeys = new Set();

  onChildAdded(usersRef, async (snapshot) => {
    const user = snapshot.val();
    const key = userKey(snapshot);
    if (!key || !user) return;

    if (initialLoad) {
      initialKeys.add(key);
      return;
    }

    const notificationKey = `${key}_added`;
    if (await alreadySent(notificationKey)) return;

    try {
      await sendChannel(newUserMessage(user));
      await markSent(notificationKey, "added", user);
    } catch (err) {
      console.error("New user notification error:", err);
    }
  });

  // Firebase fires existing children immediately after attaching onChildAdded.
  // Wait briefly before treating onChildAdded as a real new-user event.
  setTimeout(() => {
    initialLoad = false;
    console.log("👀 Firebase user watcher is ready.");
  }, 2500);

  onChildChanged(usersRef, async (snapshot) => {
    const user = snapshot.val();
    const key = userKey(snapshot);
    if (!key || !user) return;

    try {
      await processExpiry(user, key);
    } catch (err) {
      console.error("Expiry notification error:", err);
    }
  });

  // A timer is needed because your website calculates status in the browser
  // from expiresAt; Firebase does not automatically change a status field.
  setInterval(async () => {
    try {
      const { get } = require("firebase/database");
      const snap = await get(usersRef);
      if (!snap.exists()) return;

      const data = snap.val();
      for (const [key, user] of Object.entries(data)) {
        await processExpiry(user, key);
      }
    } catch (err) {
      console.error("Expiry scan error:", err);
    }
  }, 60 * 1000);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ WhatsApp Bot connected!");
      console.log("📢 Channel:", TARGET_CHANNEL_JID);
      listenFirebaseChanges();
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      console.log("⚠️ WhatsApp connection closed. Reconnect:", shouldReconnect);

      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        console.log("❌ Logged out. Delete auth_info and pair again.");
      }
    }
  });

  if (!state.creds.registered) {
    // Pairing code requires the international format without +.
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(BOT_PHONE_NUMBER);
        console.log("\n==============================");
        console.log("🔗 WHATSAPP PAIRING CODE:", code);
        console.log("==============================\n");
        console.log("WhatsApp → Linked devices → Link a device → Link with phone number");
      } catch (err) {
        console.error("❌ Pairing code error:", err);
      }
    }, 3000);
  }
}

startBot().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
