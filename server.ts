import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { config } from './src/config/index.js';
import { startBot, stopBot, getBotStatus, getBotClient } from './src/music/bot-client.js';
import { playerManager } from './src/music/PlayerManager.js';
import { logger } from './src/utils/logger.js';
import { initPlayDL } from './src/utils/playdl-init.js';
import { ensureYtDlp } from './src/utils/youtube-search.js';

import multer from 'multer';

// Load environment files
dotenv.config();

// Set up multer for cookie file uploads
const upload = multer({ dest: 'uploads/' });

async function bootstrap() {
  const app = express();
  const PORT = 3000;
  
  // High-capacity JSON and text parsers for cookies and config updates
  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ limit: '10mb' }));

  // --- API ENDPOINTS ---

  // Get current bot and environment configuration details
  app.get('/api/config', (req, res) => {
    res.json({
      isConfigured: config.isConfigured,
      hasCookies: config.hasCookies,
      clientId: config.clientId,
      cookiePath: config.cookiePath,
      tokenSet: config.token.length > 0,
    });
  });

  // Save new bot configurations and rewrite the local .env file
  app.post('/api/config', async (req, res) => {
    const { token, clientId } = req.body;
    
    if (!token || !clientId) {
      return res.status(400).json({ success: false, message: 'Thiếu Token hoặc Client ID!' });
    }

    try {
      const envPath = path.join(process.cwd(), '.env');
      
      // Construct the new env file content
      const envContent = `BOT_TOKEN="${token}"
CLIENT_ID="${clientId}"
COOKIE_PATH="${config.cookiePath}"
PORT=${config.port}
`;

      fs.writeFileSync(envPath, envContent, 'utf8');
      
      // Update running memory configurations
      config.token = token;
      config.clientId = clientId;

      logger.success('New bot credentials configured and written to .env file.');

      // Safely restart the bot with the new token
      await stopBot();
      const botStarted = await startBot();

      res.json({ 
        success: true, 
        message: 'Cập nhật cấu hình thành công! ' + (botStarted ? 'Bot đã kết nối lại.' : 'Đang chờ khởi động bot.')
      });
    } catch (err: any) {
      logger.error('Failed to update credentials or restart bot:', err);
      res.status(500).json({ success: false, message: `Lỗi lưu cấu hình: ${err.message}` });
    }
  });

  // Cookie management endpoints
  app.get('/api/settings/cookies', (req, res) => {
    const cookiePath = config.absoluteCookiePath;
    const exists = fs.existsSync(cookiePath);
    let lastUpdated = null;
    
    if (exists) {
      const stats = fs.statSync(cookiePath);
      lastUpdated = stats.mtime;
    }
    
    res.json({
      exists,
      lastUpdated,
      path: config.cookiePath
    });
  });

  app.post('/api/settings/cookies', upload.single('cookieFile'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được tải lên!' });
    }

    try {
      const cookieDir = path.dirname(config.absoluteCookiePath);
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      fs.renameSync(req.file.path, config.absoluteCookiePath);
      
      // Re-initialize play-dl with newly supplied cookie credentials
      await initPlayDL();
      
      res.json({ success: true, message: 'Đã cập nhật file cookies.txt thành công! Play-DL đã tải cookie mới.' });
    } catch (err: any) {
      logger.error('Failed to save cookie file:', err);
      res.status(500).json({ success: false, message: `Lỗi khi lưu file cookie: ${err.message}` });
    }
  });

  // Upload/save youtube cookies.txt contents (Legacy Text version)
  app.post('/api/cookie', async (req, res) => {
    const { cookieText } = req.body;
    
    if (!cookieText || cookieText.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Nội dung cookie trống!' });
    }

    try {
      const cookieDir = path.dirname(config.absoluteCookiePath);
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      fs.writeFileSync(config.absoluteCookiePath, cookieText, 'utf8');
      logger.success(`Custom cookies.txt saved to: ${config.absoluteCookiePath}`);

      // Re-initialize play-dl with newly supplied cookie credentials
      await initPlayDL();

      res.json({ success: true, message: 'Lưu cookie.txt thành công! Play-DL đã tải cookie mới.' });
    } catch (err: any) {
      logger.error('Failed to save cookie file:', err);
      res.status(500).json({ success: false, message: `Lỗi ghi file cookie: ${err.message}` });
    }
  });

  // Check current status of the bot client
  app.get('/api/status', (req, res) => {
    const status = getBotStatus();
    logger.info(`Status requested: ${JSON.stringify(status)}`);
    res.json(status);
  });

  app.post('/api/restart-bot', async (req, res) => {
    try {
      await stopBot();
      await startBot();
      res.json({ success: true, message: 'Đã khởi động lại bot' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/guilds', (req, res) => {
    const client = getBotClient();
    if (!client) return res.status(503).json({ success: false, message: 'Bot chưa kết nối' });
    
    const guilds = client.guilds.cache.map(guild => ({
      id: guild.id,
      name: guild.name,
      channels: guild.channels.cache
        .filter(c => c.type === 2) // ChannelType.GuildVoice
        .map(c => ({ id: c.id, name: c.name })),
      textChannels: guild.channels.cache
        .filter(c => c.type === 0) // ChannelType.GuildText
        .map(c => ({ id: c.id, name: c.name }))
    }));
    res.json(guilds);
  });

  // Retrieve active players queues states
  app.get('/api/queues', (req, res) => {
    res.json(playerManager.listStates());
  });

  // Perform music player controls from dashboard (skip, pause, resume, volume)
  app.post('/api/control', (req, res) => {
    const { guildId, action, value } = req.body;
    
    if (!guildId || !action) {
      return res.status(400).json({ success: false, message: 'Thiếu guildId hoặc hành động điều khiển!' });
    }

    const queue = playerManager.get(guildId);
    if (!queue) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hàng đợi cho server này!' });
    }

    try {
      if (action === 'skip') {
        queue.skip();
        return res.json({ success: true, message: 'Đã bỏ qua bài hát hiện tại!' });
      }
      if (action === 'pause') {
        queue.pause();
        return res.json({ success: true, message: 'Đã tạm dừng trình phát nhạc!' });
      }
      if (action === 'resume') {
        queue.resume();
        return res.json({ success: true, message: 'Đã tiếp tục phát nhạc!' });
      }
      if (action === 'stop') {
        queue.stop();
        return res.json({ success: true, message: 'Đã dừng phát và làm trống hàng đợi!' });
      }
      if (action === 'volume') {
        const vol = parseInt(value, 10);
        if (!isNaN(vol)) {
          queue.setVolume(vol);
          return res.json({ success: true, message: `Đã đổi âm lượng thành ${vol}%` });
        }
      }
      if (action === 'loop') {
        queue.loopMode = value as 'off' | 'track' | 'queue';
        return res.json({ success: true, message: `Đã đổi chế độ lặp thành ${value.toUpperCase()}` });
      }
      if (action === '247') {
        queue.set247(Boolean(value));
        return res.json({ success: true, message: 'Đã cập nhật chế độ 24/7' });
      }
      res.status(400).json({ success: false, message: 'Hành động không hợp lệ' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Play/Join API
  app.post('/api/music/play', async (req, res) => {
    const { guildId, query, voiceChannelId, textChannelId } = req.body;
    if (!guildId || !query) return res.status(400).json({ success: false, message: 'Thiếu thông tin!' });
    
    // Use playerManager to get/create queue
    // Need to handle voice channel joining
    try {
      const client = getBotClient();
      if (!client) throw new Error('Bot chưa kết nối!');
      
      const guild = client.guilds.cache.get(guildId);
      if (!guild) throw new Error('Không tìm thấy server!');
      
      let queue = playerManager.get(guildId);
      
      if (!queue) {
        if (!voiceChannelId) throw new Error('Thiếu kênh thoại để join!');
        
        // This mimics join command
        const { joinVoiceChannel } = await import('@discordjs/voice');
        const channel = guild.channels.cache.get(voiceChannelId);
        if (!channel || channel.type !== 2) throw new Error('Kênh thoại không hợp lệ!');
        
        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
        });
        
        queue = playerManager.create(guild.id, guild.name, connection, channel.id, channel.name, textChannelId);
      } else if (textChannelId) {
        queue.textChannelId = textChannelId;
      }
      
      // Now play
      const { Track } = await import('./src/music/Track.js');
      const { searchYouTube } = await import('./src/utils/youtube-search.js');
      
      const results = await searchYouTube(query, 1, 'youtube');
      if (results.length === 0) throw new Error('Không tìm thấy kết quả!');
      
      const track = new Track({
        title: results[0].title,
        url: results[0].url,
        thumbnail: results[0].thumbnail || '',
        duration: results[0].duration,
        durationString: results[0].durationString,
        requestedBy: { username: 'Dashboard' },
        source: 'youtube',
      });
      
      queue.addTracks([track]);
      
      res.json({ success: true, message: `Đã thêm: ${track.title}` });
    } catch (err: any) {
      logger.error('API Play Error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Deploy Slash Commands API
  app.post('/api/deploy-commands', async (req, res) => {
    try {
      const { deploySlashCommands } = await import('./src/utils/deploy-commands.js');
      const result = await deploySlashCommands();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // --- Vite Middleware / Static Files ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // --- Start Server ---
  app.listen(PORT, '0.0.0.0', () => {
    logger.success(`Server running on http://localhost:${PORT}`);
    // Start Discord Bot silently in background
    (async () => {
      try {
        await ensureYtDlp();
        startBot();
      } catch (err) {
        logger.error('Failed to start bot', err);
      }
    })();
  });
}

// Global process error catchers to prevent bot crashes
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

bootstrap();
