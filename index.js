import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { pino } from 'pino';
import fs from 'fs';
import qrcode from 'qrcode-terminal';

const silentLogger = pino({ level: 'silent' });


const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: silentLogger
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) startSock(); // auto‑reconnect
    }

    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp');
    }
  });

  // ✅ Listen for messages and reply
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      const msg = messages[0];
      if (!msg.key.fromMe) {
        const from = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (from == "94741252394@s.whatsapp.net"){
          console.log(`📩 Message from ${from}: ${text}`);
        }
        

        // ✅ Reply back
        await sock.sendMessage(from, { text: `You said: ${text}` });
      }
    }
  });
};

startSock();

