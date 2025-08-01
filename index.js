import {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
  } from '@whiskeysockets/baileys';
  import { pino } from 'pino';
  import qrcode from 'qrcode-terminal';
  import axios from 'axios';
  import fs from 'fs';
  import path from 'path';
  import mime from 'mime';
  
  
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
        if (code !== DisconnectReason.loggedOut) startSock();
      }
      if (connection === 'open') {
        console.log('✅ Connected to WhatsApp');
        // const groups = await sock.groupFetchAllParticipating();
  
        try {
          // ✅ Fetch all groups
          const groups = await sock.groupFetchAllParticipating();
  
          // ✅ Print group names and IDs
          for (const id in groups) {
            const group = groups[id];
            // console.log(`📛 Group Name: ${group.subject}`);
            // console.log(`🆔 Group ID: ${group.id}`);
          }
        } catch (err) {
          console.error('❌ Error fetching groups:', err);
        }
      }
  
  
    });
  
  
  
  
  
    // ✅ Download helper
    async function downloadFile(url, outputPath) {
      try {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream',
          timeout: 60000
        });
  
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
  
        return new Promise((resolve, reject) => {
          writer.on('finish', () => resolve(outputPath)); // ✅ resolves when fully written
          writer.on('error', err => {
            fs.unlink(outputPath, () => { }); // delete partial file
            reject(err);
          });
        });
      } catch (error) {
        throw new Error(`Download failed: ${error.message}`);
      }
    }
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;
  
      const from = msg.key.remoteJid;
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';
  
  
      if (text && text.startsWith('download') && (from === "94741252394@s.whatsapp.net" || from === "94757979207@s.whatsapp.net")) {
        try {
          const jsonString = text.replace('download', '').trim();
          const videoList = JSON.parse(jsonString);
  
          if (!Array.isArray(videoList)) {
            await sock.sendMessage(from, { text: '❌ Invalid format! Use: download [ { "url": "...", "filename": "..." } ]' });
            return;
          }
  
          if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
  
          for (const video of videoList) {
            if (!video.url || !video.filename) {
              await sock.sendMessage(from, { text: `❌ Missing url or filename for ${JSON.stringify(video)}` });
              continue;
            }
  
            const filePath = path.resolve('./downloads', video.filename);
  
            // 1. Notify start
            await sock.sendMessage(from, { text: `⬇️ Downloading ${video.filename}...` });
  
            try {
  
              await downloadFile(video.url, filePath)
              const mimeType = mime.getType(filePath);
              await sock.sendMessage(from, { text: `✅ Download complete. Sending ${video.filename}...` });
              // await sock.sendMessage("120363418874865933@g.us", {
              //   document: fs.readFileSync(filePath),
              //   mimetype: 'video/mp4',
              //   fileName: video.filename
              // });
  


              await sock.sendMessage("94764955562@s.whatsapp.net", {
                document: fs.readFileSync(filePath),
                mimetype: mimeType,
                fileName: video.filename
              });
              
  
              // 5. Delete file
              // fs.unlinkSync(filePath);
            } catch (err) {
              await sock.sendMessage(from, { text: `❌ Failed to download ${video.url}. Error: ${err.message}` });
            }
          }
        } catch (err) {
          await sock.sendMessage(from, { text: '❌ Invalid JSON format. Example:\ndownload [ { "url": "...", "filename": "..." } ]' });
        }
      }
    });
  
  }
  
  
  
  
  startSock();
  
