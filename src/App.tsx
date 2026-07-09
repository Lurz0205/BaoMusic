import React, { useState, useEffect } from 'react';
import { 
  Music, 
  Activity, 
  Wifi, 
  Settings, 
  Trash2, 
  Play, 
  Pause, 
  SkipForward, 
  Volume2, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Compass, 
  BookOpen, 
  Terminal, 
  Clock, 
  Upload, 
  Disc,
  Eye,
  EyeOff,
  Copy,
  Plus
} from 'lucide-react';
import { BotStatus, QueueState, TrackData } from './types';

export default function App() {
  // Bot status states
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [queues, setQueues] = useState<QueueState[]>([]);
  const [config, setConfig] = useState<{
    isConfigured: boolean;
    hasCookies: boolean;
    clientId: string;
    cookiePath: string;
    tokenSet: boolean;
  } | null>(null);

  // Form states
  const [tokenInput, setTokenInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  
  // UI states
  const [activeTab, setActiveTab] = useState<'status' | 'config' | 'guide'>('status');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [statusRes, queuesRes, configRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/queues'),
        fetch('/api/config')
      ]);

      if (statusRes.ok) setStatus(await statusRes.json());
      if (queuesRes.ok) setQueues(await queuesRes.json());
      if (configRes.ok) {
        const conf = await configRes.json();
        setConfig(conf);
        setClientIdInput(conf.clientId || '');
      }
    } catch (err) {
      console.error('Failed to fetch data from Express backend:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll data every 4 seconds for real-time room controls and stats
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const triggerAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  // Save Bot Token and Client ID credentials
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim() || !clientIdInput.trim()) {
      return triggerAlert('error', 'Vui lòng nhập đầy đủ Token và Client ID!');
    }

    setLoading(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput, clientId: clientIdInput }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        triggerAlert('success', data.message);
        setTokenInput('');
        fetchData();
      } else {
        triggerAlert('error', data.message || 'Lưu cấu hình thất bại.');
      }
    } catch (err: any) {
      triggerAlert('error', `Lỗi kết nối: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save cookie.txt contents
  const handleSaveCookie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookieInput.trim()) {
      return triggerAlert('error', 'Nội dung cookie không được bỏ trống!');
    }

    setLoading(true);
    try {
      const res = await fetch('/api/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookieText: cookieInput }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        triggerAlert('success', data.message);
        setCookieInput('');
        fetchData();
      } else {
        triggerAlert('error', data.message || 'Lưu cookie thất bại.');
      }
    } catch (err: any) {
      triggerAlert('error', `Lỗi kết nối: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Sync / Register slash commands with Discord API
  const handleDeployCommands = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/deploy-commands', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        triggerAlert('success', data.message);
      } else {
        triggerAlert('error', data.message || 'Không thể đăng ký Slash Commands.');
      }
    } catch (err: any) {
      triggerAlert('error', `Lỗi kết nối: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Reboot Discord Bot connection
  const handleRestartBot = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/restart-bot', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        triggerAlert('success', 'Đã khởi động lại kết nối của bot thành công!');
        fetchData();
      } else {
        triggerAlert('error', data.message || 'Không thể khởi động lại bot.');
      }
    } catch (err: any) {
      triggerAlert('error', `Lỗi kết nối: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Perform a music queue action control
  const handleQueueControl = async (guildId: string, action: string, value?: any) => {
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId, action, value }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        triggerAlert('success', data.message);
        fetchData();
      } else {
        triggerAlert('error', data.message || 'Thao tác điều khiển thất bại.');
      }
    } catch (err: any) {
      triggerAlert('error', `Lỗi kết nối: ${err.message}`);
    }
  };

  // Helper copy text
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const inviteUrl = config?.clientId 
    ? `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=3233856&scope=bot%20applications.commands`
    : '';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans antialiased pb-12">
      {/* Upper Navigation Header */}
      <header className="sticky top-0 z-30 w-full bg-white border-b border-slate-200/80 backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Music className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">Discord Music Bot</h1>
              <p className="text-xs text-slate-500 font-medium">Full-stack Management Dashboard</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('status')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'status' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Trình phát & Trạng thái
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'config' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Cấu hình & Cookies
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'guide' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Hướng dẫn Deploy
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Floating Notification Alerts */}
        {alert && (
          <div className={`fixed bottom-6 right-6 z-50 flex items-center space-x-3 px-5 py-4 rounded-xl shadow-xl transition-all duration-300 transform translate-y-0 ${
            alert.type === 'success' 
              ? 'bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800' 
              : 'bg-rose-50 border-l-4 border-rose-500 text-rose-800'
          }`}>
            {alert.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />}
            <span className="text-sm font-medium">{alert.message}</span>
          </div>
        )}

        {/* Global Summary Status Indicators */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {/* Status Indicator Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">Kết nối bot</span>
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${status?.online ? 'bg-emerald-500 animate-ping' : 'bg-rose-400'}`} />
                <h3 className="text-base font-bold text-slate-900">
                  {status?.online ? `@${status.username}` : 'Chưa kết nối'}
                </h3>
              </div>
            </div>
            <div className={`p-3 rounded-xl ${status?.online ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <Wifi className="w-5 h-5" />
            </div>
          </div>

          {/* Latency Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">Độ trễ Gateway</span>
              <h3 className="text-2xl font-black text-slate-900 font-mono">
                {status?.online && status.latency >= 0 ? `${status.latency}ms` : 'N/A'}
              </h3>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          {/* Connected Guilds Count */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">Đang phục vụ</span>
              <h3 className="text-2xl font-black text-slate-900 font-mono">
                {status?.guildsCount || 0} Guilds
              </h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Disc className="w-5 h-5" />
            </div>
          </div>

          {/* Active Players Rooms Count */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">Phòng đang phát</span>
              <h3 className="text-2xl font-black text-slate-900 font-mono">
                {status?.activePlayersCount || 0} Kênh
              </h3>
            </div>
            <div className="p-3 bg-cyan-50 text-cyan-600 rounded-xl">
              <Compass className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Tab content view 1: Playback & Status */}
        {activeTab === 'status' && (
          <div className="space-y-8">
            {/* If bot is not configured, show alert setup banner */}
            {!config?.isConfigured && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-amber-800 font-bold flex items-center gap-2 text-base">
                    ⚠️ Bot chưa được cấu hình thông tin kết nối!
                  </h4>
                  <p className="text-sm text-amber-700 max-w-2xl">
                    Vui lòng chuyển sang tab <strong>Cấu hình & Cookies</strong> để nhập Discord Bot Token và Client ID của bạn để kích hoạt bot hoạt động.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('config')}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm shadow-md transition-all duration-150"
                >
                  Cấu hình ngay
                </button>
              </div>
            )}

            {config?.isConfigured && !status?.online && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-rose-800 font-bold flex items-center gap-2 text-base">
                    ❌ Bot đang Offline hoặc thông tin Token không hợp lệ!
                  </h4>
                  <p className="text-sm text-rose-700 max-w-2xl">
                    Hệ thống đã nhận cấu hình nhưng không thể kết nối tới máy chủ Discord. Hãy kiểm tra lại tính chính xác của Token hoặc thử nhấn nút khởi động lại ở bên phải.
                  </p>
                </div>
                <button
                  onClick={handleRestartBot}
                  disabled={loading}
                  className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm shadow-md transition-all duration-150 flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Khởi động lại Bot
                </button>
              </div>
            )}

            {/* Quick action system buttons if configured */}
            {config?.isConfigured && status?.online && (
              <div className="flex flex-wrap gap-4 items-center bg-white p-5 rounded-2xl border border-slate-200/70 shadow-sm">
                <div className="text-sm font-semibold text-slate-700 mr-2">Thao tác nhanh:</div>
                <button
                  onClick={handleDeployCommands}
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Đồng bộ Slash Commands
                </button>
                <button
                  onClick={handleRestartBot}
                  disabled={loading}
                  className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold text-xs px-4 py-2.5 rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Kết nối lại Discord Bot
                </button>
                {inviteUrl && (
                  <a
                    href={inviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-all duration-150 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Mời Bot vào Server Discord
                  </a>
                )}
              </div>
            )}

            {/* Live active music rooms */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Các phòng Voice đang phát nhạc</h2>
                <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-100">
                  {queues.length} Phòng hoạt động
                </span>
              </div>

              {queues.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/70 p-12 text-center shadow-sm space-y-4">
                  <div className="p-4 bg-slate-50 text-slate-400 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                    <Music className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-slate-800">Không có phòng Voice nào đang phát nhạc</h4>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">
                      Hãy mời Bot vào phòng thoại và gõ lệnh slash **`/play [tên bài hát hoặc link]`** trong server Discord để bắt đầu trải nghiệm âm nhạc!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {queues.map((room) => (
                    <div key={room.guildId} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                      {/* Current track banner */}
                      <div className="lg:col-span-5 bg-slate-900 text-slate-100 p-6 flex flex-col justify-between space-y-6 relative overflow-hidden">
                        {/* Decorative background overlay */}
                        <div className="absolute inset-0 opacity-10 bg-cover bg-center" style={{ backgroundImage: room.currentTrack?.thumbnail ? `url(${room.currentTrack.thumbnail})` : 'none' }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-transparent" />

                        <div className="relative z-10 flex items-center justify-between">
                          <div>
                            <span className="text-xs bg-indigo-500/20 text-indigo-300 font-bold px-2.5 py-1 rounded-md border border-indigo-500/30">
                              🔊 {room.channelName || 'Kênh Thoại'}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-bold tracking-wider uppercase">
                            {room.guildName}
                          </span>
                        </div>

                        <div className="relative z-10 space-y-3">
                          {room.currentTrack ? (
                            <>
                              <div className="flex gap-4 items-start">
                                {room.currentTrack.thumbnail && (
                                  <img 
                                    src={room.currentTrack.thumbnail} 
                                    alt={room.currentTrack.title} 
                                    className="w-20 h-20 rounded-xl object-cover shadow-lg border border-slate-700 flex-shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <div className="space-y-1">
                                  <h4 className="text-base font-bold text-white line-clamp-2 leading-snug">
                                    {room.currentTrack.title}
                                  </h4>
                                  <p className="text-xs text-slate-400 font-medium">
                                    Yêu cầu bởi: <span className="text-indigo-300 font-semibold">{room.currentTrack.requestedBy.username}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 space-y-1.5">
                                {/* Simulated track bar */}
                                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className={`h-full bg-indigo-500 rounded-full ${room.isPlaying ? 'animate-pulse' : ''}`}
                                    style={{ width: room.isPlaying ? '40%' : '0%' }}
                                  />
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-slate-400 font-semibold">
                                  <span>{room.isPlaying ? '01:45' : '00:00'}</span>
                                  <span>{room.currentTrack.durationString}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-slate-400 text-sm py-4 italic">Hàng đợi trống...</div>
                          )}
                        </div>

                        {/* Direct remote play control buttons for each server */}
                        <div className="relative z-10 pt-4 flex items-center space-x-3">
                          {room.isPaused ? (
                            <button
                              onClick={() => handleQueueControl(room.guildId, 'resume')}
                              className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition duration-150 flex-shrink-0 cursor-pointer shadow-lg"
                              title="Tiếp tục"
                            >
                              <Play className="w-4 h-4 fill-white" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleQueueControl(room.guildId, 'pause')}
                              className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition duration-150 flex-shrink-0 cursor-pointer shadow-lg"
                              title="Tạm dừng"
                            >
                              <Pause className="w-4 h-4 fill-white" />
                            </button>
                          )}

                          <button
                            onClick={() => handleQueueControl(room.guildId, 'skip')}
                            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full transition duration-150 cursor-pointer border border-slate-700"
                            title="Bỏ qua"
                          >
                            <SkipForward className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleQueueControl(room.guildId, 'stop')}
                            className="p-3 bg-rose-950 hover:bg-rose-900 text-rose-300 rounded-full transition duration-150 cursor-pointer border border-rose-900/60"
                            title="Dừng & Clear"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
                            <Volume2 className="w-4 h-4 text-slate-400" />
                            <input 
                              type="range"
                              min="0"
                              max="100"
                              value={room.volume}
                              onChange={(e) => handleQueueControl(room.guildId, 'volume', e.target.value)}
                              className="w-20 accent-indigo-500 h-1 rounded-full bg-slate-800 cursor-pointer"
                            />
                            <span className="text-[10px] font-mono font-bold text-slate-400 w-6 text-right">
                              {room.volume}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Room settings and upcoming queues */}
                      <div className="lg:col-span-7 p-6 flex flex-col justify-between bg-white border-l border-slate-100">
                        <div className="space-y-5">
                          {/* Room State toggles: Loop, Autoplay, 24/7 */}
                          <div className="flex flex-wrap gap-3">
                            {/* Loop mode dropdown selector */}
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold gap-1.5">
                              <span>Lặp:</span>
                              <select 
                                value={room.loopMode}
                                onChange={(e) => handleQueueControl(room.guildId, 'loop', e.target.value)}
                                className="bg-transparent font-bold text-indigo-600 focus:outline-none cursor-pointer"
                              >
                                <option value="off">Off</option>
                                <option value="track">Track (1 bài)</option>
                                <option value="queue">Queue (Hàng)</option>
                              </select>
                            </div>

                            {/* Autoplay toggler */}
                            <button
                              onClick={() => handleQueueControl(room.guildId, 'autoplay', !room.autoplay)}
                              className={`flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border transition duration-150 cursor-pointer gap-1.5 ${
                                room.autoplay 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span>Autoplay:</span>
                              <span>{room.autoplay ? 'BẬT' : 'TẮT'}</span>
                            </button>

                            {/* 24/7 toggler */}
                            <button
                              onClick={() => handleQueueControl(room.guildId, '247', !room.is247)}
                              className={`flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border transition duration-150 cursor-pointer gap-1.5 ${
                                room.is247 
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span>Chế độ 24/7:</span>
                              <span>{room.is247 ? 'BẬT' : 'TẮT'}</span>
                            </button>
                          </div>

                          {/* Queue tracks list */}
                          <div className="space-y-2">
                            <div className="text-xs font-bold tracking-wider text-slate-500 uppercase">Danh sách chờ sắp tới ({room.tracks.length} bài)</div>
                            
                            {room.tracks.length <= 1 ? (
                              <div className="text-slate-400 text-xs italic bg-slate-50 rounded-xl p-4 border border-dashed border-slate-200">
                                Không có bài hát nào tiếp theo trong hàng đợi. Nhập thêm nhạc trong Discord!
                              </div>
                            ) : (
                              <div className="max-h-36 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                                {room.tracks.slice(1, 6).map((t, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-xs bg-slate-50 border border-slate-100 rounded-lg p-2 hover:bg-slate-100/70 transition duration-100">
                                    <span className="font-semibold text-slate-700 line-clamp-1 flex-1 pr-4">
                                      {idx + 1}. {t.title}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400 font-bold flex-shrink-0">
                                      ⏱️ {t.durationString}
                                    </span>
                                  </div>
                                ))}
                                {room.tracks.length > 6 && (
                                  <div className="text-[10px] text-center text-indigo-600 font-bold bg-indigo-50/40 py-1.5 rounded-lg border border-indigo-50/20">
                                    + {room.tracks.length - 6} bài hát khác trong hàng chờ
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab content view 2: Config & Credentials */}
        {activeTab === 'config' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Credentials Configuration card */}
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6 space-y-6">
              <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Thông tin cấu hình Bot</h3>
                  <p className="text-xs text-slate-500 font-medium">Nhập thông tin xác thực từ Discord Developer Portal</p>
                </div>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 tracking-wide uppercase flex items-center justify-between">
                    <span>Discord Bot Token</span>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-bold text-[10px] lowercase"
                    >
                      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showToken ? 'Ẩn' : 'Hiện'}
                    </button>
                  </label>
                  <input
                    type={showToken ? 'text' : 'password'}
                    placeholder={config?.tokenSet ? '••••••••••••••••••••••••••••••••••••••••••••••••' : 'Nhập Discord Token của bạn'}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="w-full text-slate-800 font-mono text-sm px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition duration-150"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 tracking-wide uppercase">Discord Client ID</label>
                  <input
                    type="text"
                    placeholder="Nhập Client ID (Application ID) của bạn"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    className="w-full text-slate-800 font-mono text-sm px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition duration-150"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 px-5 rounded-xl transition duration-150 cursor-pointer shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Lưu cấu hình & Kết nối Bot
                </button>
              </form>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 leading-relaxed space-y-2">
                <div className="font-bold text-slate-700">Làm thế nào để lấy các thông tin này?</div>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Truy cập <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Discord Portal</a>.</li>
                  <li>Tạo một Application mới, sao chép <strong>Application ID</strong> làm Client ID.</li>
                  <li>Vào mục <strong>Bot</strong>, nhấn <strong>Reset Token</strong> và sao chép mã Token.</li>
                  <li>Trong mục Bot, hãy cấp các quyền **Privileged Gateway Intents** (đặc biệt là <em>Guild Members, Message Content</em>).</li>
                </ol>
              </div>
            </div>

            {/* Cookies file configurations card */}
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6 space-y-6">
              <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">YouTube cookies.txt</h3>
                  <p className="text-xs text-slate-500 font-medium">Giúp vượt lỗi chặn YouTube hoặc phát nhạc giới hạn độ tuổi</p>
                </div>
              </div>

              <form onSubmit={handleSaveCookie} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 tracking-wide uppercase flex items-center justify-between">
                    <span>Nội dung file cookies.txt</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      config?.hasCookies ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {config?.hasCookies ? '🟢 Đã nạp Cookie' : '⚪ Chưa có Cookie'}
                    </span>
                  </label>
                  <textarea
                    placeholder="# Netscape HTTP Cookie File&#10;# This file was generated by cookies.txt extension&#10;.youtube.com&#x9;TRUE&#x9;/&#x9;TRUE&#x9;1734567890&#x9;HSID&#x9;..."
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    rows={6}
                    className="w-full text-slate-800 font-mono text-xs px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition duration-150"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm py-3 px-5 rounded-xl transition duration-150 cursor-pointer shadow-lg flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Cập nhật cookies.txt
                </button>
              </form>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 leading-relaxed space-y-2">
                <div className="font-bold text-slate-700">Làm thế nào để lấy cookies.txt?</div>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Cài đặt tiện ích mở rộng Chrome/Firefox tên là: <strong>Get cookies.txt LOCALLY</strong> hoặc <strong>cookies.txt</strong>.</li>
                  <li>Đăng nhập tài khoản Google và mở trang <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">YouTube.com</a>.</li>
                  <li>Click vào icon tiện ích và tải về file cookie dạng Netscape.</li>
                  <li>Mở file đó ra, sao chép toàn bộ text nội dung và dán vào ô nhập liệu phía trên.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Tab content view 3: Deployment & Guides */}
        {activeTab === 'guide' && (
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6 lg:p-8 space-y-8">
            <div className="flex items-center space-x-3 pb-5 border-b border-slate-100">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Hướng dẫn Deploy chi tiết từ A - Z</h2>
                <p className="text-xs text-slate-500 font-medium">Các bước triển khai dự án lên Render Free Tier và thiết lập UptimeRobot ping</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Step 1: Export project */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/50 space-y-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md">
                  1
                </div>
                <h4 className="text-sm font-bold text-slate-900">Đưa dự án lên GitHub</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Tải dự án về máy của bạn qua tùy chọn ZIP trong menu cài đặt AI Studio, khởi tạo một repository trên GitHub và đẩy mã nguồn lên đó.
                </p>
              </div>

              {/* Step 2: Deploy to Render */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/50 space-y-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md">
                  2
                </div>
                <h4 className="text-sm font-bold text-slate-900">Tạo Web Service trên Render</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Liên kết tài khoản GitHub với Render.com. Chọn <strong>New +</strong> &gt; <strong>Web Service</strong>. Chọn repository chứa bot nhạc của bạn.
                </p>
              </div>

              {/* Step 3: Setup UptimeRobot */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/50 space-y-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md">
                  3
                </div>
                <h4 className="text-sm font-bold text-slate-900">Giữ bot online 24/7</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Đăng ký tài khoản UptimeRobot. Thêm monitor kiểu **HTTPS**, trỏ về link Web Service của Render với chu kỳ 5 phút/lần để tránh ngủ đông.
                </p>
              </div>
            </div>

            {/* Render Settings Details Section */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-600" />
                Cấu hình thông số trên Render.com
              </h3>

              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                      <th className="p-3.5">Trường thông tin</th>
                      <th className="p-3.5">Giá trị cấu hình</th>
                      <th className="p-3.5 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                    <tr>
                      <td className="p-3.5 font-bold text-slate-800">Language (Runtime)</td>
                      <td className="p-3.5 font-mono bg-slate-50/50">Node</td>
                      <td className="p-3.5 text-right"></td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-bold text-slate-800">Build Command</td>
                      <td className="p-3.5 font-mono bg-slate-50/50">npm install && npm run build</td>
                      <td className="p-3.5 text-right">
                        <button 
                          onClick={() => copyToClipboard('npm install && npm run build', 'build_cmd')}
                          className="text-indigo-600 hover:text-indigo-700 font-bold text-[10px]"
                        >
                          {copiedText === 'build_cmd' ? 'Đã sao chép!' : 'Sao chép'}
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-bold text-slate-800">Start Command</td>
                      <td className="p-3.5 font-mono bg-slate-50/50">npm start</td>
                      <td className="p-3.5 text-right">
                        <button 
                          onClick={() => copyToClipboard('npm start', 'start_cmd')}
                          className="text-indigo-600 hover:text-indigo-700 font-bold text-[10px]"
                        >
                          {copiedText === 'start_cmd' ? 'Đã sao chép!' : 'Sao chép'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Environmental variables configurations */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                Cấu hình Biến môi trường (Environment Variables)
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tại tab <strong>Environment</strong> trên Render, nhấn vào <strong>Add Environment Variable</strong> và thêm các biến sau:
              </p>

              <div className="bg-slate-900 text-slate-300 font-mono text-xs rounded-xl p-5 border border-slate-800 shadow-md space-y-2.5">
                <div>
                  <span className="text-amber-400">BOT_TOKEN</span> = <span className="text-slate-100">"Mã Token Discord Bot của bạn"</span>
                </div>
                <div>
                  <span className="text-amber-400">CLIENT_ID</span> = <span className="text-slate-100">"Mã Client ID của bạn"</span>
                </div>
                <div>
                  <span className="text-amber-400">NODE_ENV</span> = <span className="text-slate-100">"production"</span>
                </div>
                <div>
                  <span className="text-amber-400">PORT</span> = <span className="text-slate-100">3000</span>
                </div>
              </div>
            </div>

            {/* UptimeRobot Detailed configuration guidelines */}
            <div className="space-y-4 pt-4 border-t border-slate-100 leading-relaxed">
              <h3 className="text-base font-bold text-slate-900">⏰ Chi tiết tích hợp UptimeRobot</h3>
              <div className="text-xs text-slate-500 space-y-3">
                <p>
                  Render Free Tier có chế độ tự động dừng dịch vụ (ngủ đông) sau 15 phút không nhận được lưu lượng truy cập mạng nào. Điều này sẽ làm bot bị ngắt kết nối. Để duy trì bot hoạt động 24/7, hãy làm như sau:
                </p>
                <ol className="list-decimal list-inside space-y-2 pl-1.5 font-medium text-slate-600">
                  <li>Đăng ký tài khoản miễn phí tại trang <a href="https://uptimerobot.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-bold">UptimeRobot.com</a>.</li>
                  <li>Click vào nút <strong>+ Add New Monitor</strong> ở góc bên trái.</li>
                  <li>Thiết lập các trường thông tin:
                    <ul className="list-disc list-inside space-y-1.5 pl-5 mt-1 text-slate-500">
                      <li><strong>Monitor Type:</strong> Chọn <code className="bg-slate-50 px-1.5 py-0.5 rounded border">HTTPS</code>.</li>
                      <li><strong>Friendly Name:</strong> Đặt tên dễ nhớ (ví dụ: <code className="bg-slate-50 px-1.5 py-0.5 rounded border">Discord Music Bot</code>).</li>
                      <li><strong>URL (or IP):</strong> Nhập địa chỉ link Web Service của Render (ví dụ: <code className="bg-slate-50 px-1.5 py-0.5 rounded border">https://ten-bot-cua-ban.onrender.com/</code>).</li>
                      <li><strong>Monitoring Interval:</strong> Chọn thanh trượt <code className="bg-slate-50 px-1.5 py-0.5 rounded border">Every 5 minutes</code> (Mỗi 5 phút).</li>
                    </ul>
                  </li>
                  <li>Click <strong>Create Monitor</strong> để hoàn tất. UptimeRobot sẽ gửi request ping định kỳ để giữ cho máy chủ Web Service của Render luôn thức tỉnh và phát nhạc ổn định!</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
