# SHADOW X — WhatsApp Channel Update Bot

This bot watches the same Firebase Realtime Database used by the SHADOW X Bot Access Panel and sends Channel updates.

## Events
- New user added -> New User Added
- User enters the final 3 days -> Expiring Soon (once)
- User expires -> Expired (once)

## Setup
1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npm start`.
4. On first run, copy the pairing code shown in the terminal.
5. On the bot phone: WhatsApp -> Linked devices -> Link a device -> Link with phone number.
6. Keep this project running. The `auth_info` folder contains the saved WhatsApp session.

The bot reads Firebase `users/{id}` records containing:
id, name, phone, createdAt, expiresAt

Do not upload `auth_info` to GitHub or share it.
