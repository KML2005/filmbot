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
import WebTorrent from 'webtorrent';


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

async function downloadTorrent(magnetURI, outputDir, filename) {
  return new Promise((resolve, reject) => {
    if (!magnetURI.startsWith('magnet:?')) {
      return reject(new Error('Invalid magnet link format'));
    }

    const client = new WebTorrent();

    client.add(magnetURI, { path: outputDir }, (torrent) => {
      if (!torrent.files || torrent.files.length === 0) {
        return reject(new Error('No files in torrent'));
      }

      torrent.on('download', () => {
        console.log(`Progress: ${(torrent.progress * 100).toFixed(2)}%`);
      });

      torrent.on('done', () => {
        console.log('✅ Torrent Download Complete!');
        const file = torrent.files[0];
        const oldPath = file.path;
        const newPath = path.join(outputDir, filename);

        fs.rename(oldPath, newPath, (err) => {
          if (err) reject(err);
          client.destroy();
          resolve(newPath);
        });
      });

      torrent.on('error', reject);
    });
  });
}



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
  // sock.ev.on('messages.upsert', async ({ messages }) => {
  //   const msg = messages[0];
  //   if (!msg.message || msg.key.fromMe) return;

  //   const from = msg.key.remoteJid;
  //   const text =
  //     msg.message?.conversation ||
  //     msg.message?.extendedTextMessage?.text ||
  //     msg.message?.imageMessage?.caption ||
  //     '';


  //   if (text && text.startsWith('download') && from == "94741252394@s.whatsapp.net") {
  //     try {
  //       const jsonString = text.replace('download', '').trim();
  //       const videoList = JSON.parse(jsonString);

  //       if (!Array.isArray(videoList)) {
  //         await sock.sendMessage(from, { text: '❌ Invalid format! Use: download [ { "url": "...", "filename": "..." } ]' });
  //         return;
  //       }

  //       if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');

  //       for (const video of videoList) {
  //         if (!video.url || !video.filename) {
  //           await sock.sendMessage(from, { text: `❌ Missing url or filename for ${JSON.stringify(video)}` });
  //           continue;
  //         }

  //         const filePath = path.resolve('./downloads', video.filename);

  //         // 1. Notify start
  //         await sock.sendMessage(from, { text: `⬇️ Downloading ${video.filename}...` });

  //         try {

  //           await downloadFile(video.url, filePath)
  //           await sock.sendMessage(from, { text: `✅ Download complete. Sending ${video.filename}...` });
  //           await sock.sendMessage("120363418874865933@g.us", {
  //             document: fs.readFileSync(filePath),
  //             mimetype: 'video/mp4',
  //             fileName: video.filename
  //           });

  //           // 5. Delete file
  //           // fs.unlinkSync(filePath);
  //         } catch (err) {
  //           await sock.sendMessage(from, { text: `❌ Failed to download ${video.url}. Error: ${err.message}` });
  //         }
  //       }
  //     } catch (err) {
  //       await sock.sendMessage(from, { text: '❌ Invalid JSON format. Example:\ndownload [ { "url": "...", "filename": "..." } ]' });
  //     }
  //   }
  // });


  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      '';

    // ✅ 1. Normal Download
    if (text.startsWith('downlo ad ') && from == "94741252394@s.whatsapp.net") {
      try {
        const jsonString = text.replace('download', '').trim();
        const fileList = JSON.parse(jsonString);

        if (!Array.isArray(fileList)) {
          await sock.sendMessage(from, { text: '❌ Invalid format! Use: download [ { "url": "...", "filename": "..." } ]' });
          return;
        }

        if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');

        for (const file of fileList) {
          const filePath = path.resolve('./downloads', file.filename);
          await sock.sendMessage(from, { text: `⬇️ Downloading ${file.filename}...` });

          try {
            await downloadFile(file.url, filePath);
            await sock.sendMessage(from, {
              document: fs.readFileSync(filePath),
              mimetype: 'video/mp4',
              fileName: file.filename
            });
          } catch (err) {
            await sock.sendMessage(from, { text: `❌ Failed: ${err.message}` });
          }
        }
      } catch (err) {
        await sock.sendMessage(from, { text: '❌ Invalid JSON format for download' });
      }
    }

    // ✅ 2. Torrent Download
    if (text.startsWith('downloadtorrent ') && from == "94741252394@s.whatsapp.net") {
      try {
        const jsonString = text.replace('downloadtorrent', '').trim();
        const torrentList = JSON.parse(jsonString);

        if (!Array.isArray(torrentList)) {
          await sock.sendMessage(from, { text: '❌ Invalid format! Use: downloadtorrent [ { "url": "...", "filename": "..." } ]' });
          return;
        }

        if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');

        for (const torrent of torrentList) {
          const outputPath = path.resolve('./downloads', torrent.filename);
          await sock.sendMessage(from, { text: `📥 Torrent Download: ${torrent.filename}` });

          try {
            const downloadedFile = await downloadTorrent(torrent.url, './downloads', torrent.filename);
            await sock.sendMessage("120363418874865933@g.us", {
              document: fs.readFileSync(downloadedFile),
              mimetype: 'video/mp4',
              fileName: torrent.filename
            });
          } catch (err) {
            await sock.sendMessage(from, { text: `❌ Torrent failed: ${err.message}` });
          }
        }
      } catch (err) {
        await sock.sendMessage(from, { text: '❌ Invalid JSON format for downloadtorrent' });
      }
    }
  });

};

startSock();
