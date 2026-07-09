import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { config } from './src/config/index.js';
import { startBot, stopBot, getBotStatus } from './src/music/bot-client.js';
import { playerManager } from './src/music/PlayerManager.js';
import { deploySlashCommands } from './src/utils/deploy-commands.js';
import { logger } from './src/utils/logger.js';
import { initPlayDL } from './src/utils/playdl-init.js';

// Load environment files
dotenv.config();

async function bootstrap() {
  const app = express();
  
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

  // Upload/save youtube cookies.txt contents
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
    res.json(getBotStatus());
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
      if (action === 'autoplay') {
        queue.autoplay = !!value;
        return res.json({ success: true, message: `Đã ${value ? 'bật' : 'tắt'} chế độ tự động phát!` });
      }
      if (action === '247') {
        queue.set247(!!value);
        return res.json({ success: true, message: `Đã ${value ? 'bật' : 'tắt'} chế độ treo phòng 24/7!` });
      }

      res.status(400).json({ success: false, message: 'Hành động không hợp lệ!' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: `Lỗi điều khiển: ${err.message}` });
    }
  });

  // Deploy slash commands directly from UI
  app.post('/api/deploy-commands', async (req, res) => {
    const result = await deploySlashCommands();
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  });

  // Start or reboot connection of the bot
  app.post('/api/restart-bot', async (req, res) => {
    try {
      await stopBot();
      const started = await startBot();
      res.json({ success: started, message: started ? 'Bot restarted successfully!' : 'Failed to restart bot client.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // --- INTEGRATION: VITE OR STATIC FRONTEND ---

  if (process.env.NODE_ENV !== 'production') {
    // Mount Vite dev middleware
    logger.info('Mounting Vite dev middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production built files
    const distPath = path.join(process.cwd(), 'dist');
    logger.info(`Serving static production files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to port 3000
  const port = config.port;
  app.listen(port, '0.0.0.0', () => {
    logger.success(`Web API Control Panel running on: http://0.0.0.0:${port}`);
  });

  // Start the Discord Bot in the background
  try {
    if (config.isConfigured) {
      logger.info('Starting Discord Bot Client...');
      await startBot();
    } else {
      logger.warn('Discord Bot credentials are not yet set. Complete details on the Web Dashboard!');
    }
  } catch (err) {
    logger.error('Failed to initiate Discord Bot background startup:', err);
  }
}

// Global process error catchers to prevent bot crashes
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

bootstrap();
