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
  Plus,
  AlertCircle
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
  const [guilds, setGuilds] = useState<Array<{
    id: string, 
    name: string, 
    channels: Array<{id: string, name: string}>,
    textChannels: Array<{id: string, name: string}>
  }>>([]);
  const [selectedGuild, setSelectedGuild] = useState<{
    id: string, 
    name: string, 
    channels: Array<{id: string, name: string}>,
    textChannels: Array<{id: string, name: string}>
  } | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedTextChannelId, setSelectedTextChannelId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // UI states
  const [activeTab, setActiveTab] = useState<'status' | 'guide' | 'settings'>('status');
  const [cookieInfo, setCookieInfo] = useState<{ exists: boolean, lastUpdated: string | null } | null>(null);
  const [uploadingCookie, setUploadingCookie] = useState(false);
  const [updatingYtDlp, setUpdatingYtDlp] = useState(false);

  // Fetch cookie info
  const fetchCookieInfo = async () => {
    try {
      const res = await fetch('/api/settings/cookies');
      const data = await res.json();
      setCookieInfo(data);
    } catch (err) {
      console.error('Failed to fetch cookie info:', err);
    }
  };

  useEffect(() => {
    fetchCookieInfo();
  }, []);

  const handleCookieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCookie(true);
    const formData = new FormData();
    formData.append('cookieFile', file);

    try {
      const res = await fetch('/api/settings/cookies', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        triggerAlert('success', data.message);
        fetchCookieInfo();
      } else {
        triggerAlert('error', 'Lỗi: ' + data.message);
      }
    } catch (err) {
      triggerAlert('error', 'Lỗi khi tải file lên.');
    } finally {
      setUploadingCookie(false);
      e.target.value = ''; // Reset input
    }
  };
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Perform a play command
  const handlePlay = async () => {
    if (!selectedGuild || !selectedChannelId || !searchQuery) return;
    setLoading(true);
    try {
      const res = await fetch('/api/music/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          guildId: selectedGuild.id, 
          query: searchQuery, 
          voiceChannelId: selectedChannelId,
          textChannelId: selectedTextChannelId
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        triggerAlert('success', data.message);
        setSearchQuery('');
        fetchData();
      } else {
        triggerAlert('error', data.message || 'Lỗi phát nhạc.');
      }
    } catch (err: any) {
      triggerAlert('error', `Lỗi kết nối: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [statusRes, queuesRes, configRes, guildsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/queues'),
        fetch('/api/config'),
        fetch('/api/guilds')
      ]);

      if (statusRes.ok) setStatus(await statusRes.json());
      else console.error('statusRes not ok', statusRes.status);
      if (queuesRes.ok) setQueues(await queuesRes.json());
      else console.error('queuesRes not ok', queuesRes.status);
      if (configRes.ok) {
        const conf = await configRes.json();
        setConfig(conf);
      }
      else console.error('configRes not ok', configRes.status);
      if (guildsRes.ok) setGuilds(await guildsRes.json());
      else console.error('guildsRes not ok', guildsRes.status);
    } catch (err) {
      console.error('Failed to fetch data from Express backend:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll data every 4 seconds for real-time room controls and stats
    const interval = setInterval(fetchData, 4000);
    
    // Smooth progress bar update (local interpolation)
    const progressInterval = setInterval(() => {
      setQueues(prevQueues => prevQueues.map(q => {
        if (q.isPlaying && !q.isPaused && q.currentTrack && q.playbackDuration < q.currentTrack.duration) {
          return { ...q, playbackDuration: q.playbackDuration + 0.5 };
        }
        return q;
      }));
    }, 500);

    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, []);

  const triggerAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
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

  const handleUpdateYtDlp = async () => {
    setUpdatingYtDlp(true);
    try {
      const res = await fetch('/api/settings/update-ytdlp', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        triggerAlert('success', data.message);
      } else {
        triggerAlert('error', data.message || 'Lỗi cập nhật yt-dlp.');
      }
    } catch (err: any) {
      triggerAlert('error', `Lỗi kết nối: ${err.message}`);
    } finally {
      setUpdatingYtDlp(false);
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
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans antialiased pb-12 selection:bg-indigo-500/30">
      {/* Upper Navigation Header */}
      <header className="sticky top-0 z-30 w-full bg-slate-900/80 border-b border-slate-800 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
              <Music className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Discord Music Bot</h1>
              <p className="text-xs text-slate-400 font-medium">Cosmic Control Center</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('status')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'status' 
                  ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)] border border-indigo-500' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Trình phát & Trạng thái
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'guide' 
                  ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)] border border-indigo-500' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Hướng dẫn Deploy
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'settings' 
                  ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)] border border-indigo-500' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Cấu hình (Cookies)
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
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-md flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Kết nối bot</span>
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  status === null ? 'bg-amber-400' : 
                  status.online ? 'bg-emerald-400 animate-ping shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'
                }`} />
                <h3 className="text-base font-bold text-white">
                  {status === null ? 'Đang tải...' : status.online ? `@${status.username}` : 'Chưa kết nối'}
                </h3>
              </div>
            </div>
            <div className={`p-3 rounded-xl border ${status?.online ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              <Wifi className="w-5 h-5" />
            </div>
          </div>

          {/* Latency Card */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-md flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Độ trễ Gateway</span>
              <h3 className="text-2xl font-black text-white font-mono">
                {status?.online && status.latency >= 0 ? `${status.latency}ms` : 'N/A'}
              </h3>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          {/* Connected Guilds Count */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-md flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Đang phục vụ</span>
              <h3 className="text-2xl font-black text-white font-mono">
                {status?.guildsCount || 0} Guilds
              </h3>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Disc className="w-5 h-5" />
            </div>
          </div>

          {/* Active Players Rooms Count */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-md flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Phòng đang phát</span>
              <h3 className="text-2xl font-black text-white font-mono">
                {status?.activePlayersCount || 0} Kênh
              </h3>
            </div>
            <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
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
                    Vui lòng cấu hình các biến môi trường <strong>BOT_TOKEN</strong> và <strong>CLIENT_ID</strong> trong file .env hoặc trên giao diện của Render để kích hoạt bot hoạt động.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('guide')}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm shadow-md transition-all duration-150"
                >
                  Xem hướng dẫn cấu hình
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
            {config?.isConfigured && (
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-md space-y-4">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="text-sm font-semibold text-slate-300 mr-2">Thao tác nhanh:</div>
                  <button
                    onClick={handleDeployCommands}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(79,70,229,0.3)] border border-indigo-500"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Đồng bộ Slash Commands
                  </button>
                  <button
                    onClick={handleRestartBot}
                    disabled={loading}
                    className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs px-4 py-2.5 rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer border border-slate-700"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Kết nối lại Discord Bot
                  </button>
                  {inviteUrl && (
                    <a
                      href={inviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-all duration-150 flex items-center gap-1.5 shadow-[0_0_15px_rgba(52,211,153,0.3)] border border-emerald-500"
                    >
                      <Plus className="w-4 h-4" />
                      Mời Bot vào Server Discord
                    </a>
                  )}
                </div>

                {/* Music Search & Join */}
                <div className="border-t border-slate-800 pt-4 mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <select 
                    onChange={(e) => { 
                      const g = guilds.find(g => g.id === e.target.value);
                      setSelectedGuild(g || null);
                      setSelectedChannelId('');
                      setSelectedTextChannelId('');
                    }}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                  >
                    <option value="">Chọn Server</option>
                    {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <select 
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                  >
                    <option value="">Chọn kênh thoại</option>
                    {selectedGuild?.channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select 
                    value={selectedTextChannelId}
                    onChange={(e) => setSelectedTextChannelId(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                  >
                    <option value="">Chọn kênh văn bản (Gửi tin nhắn)</option>
                    {selectedGuild?.textChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="flex gap-2 md:col-span-3">
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm nhạc hoặc dán link..."
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                    <button 
                      onClick={handlePlay}
                      disabled={loading || !selectedGuild || !selectedChannelId || !selectedTextChannelId || !searchQuery}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-sm"
                    >
                      Phát
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Live active music rooms */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold tracking-tight text-white">Các phòng Voice đang phát nhạc</h2>
                <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                  {queues.length} Phòng hoạt động
                </span>
              </div>

              {queues.length === 0 ? (
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 text-center shadow-md space-y-4">
                  <div className="p-4 bg-slate-800 text-slate-500 rounded-full w-16 h-16 mx-auto flex items-center justify-center border border-slate-700">
                    <Music className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-white">Không có phòng Voice nào đang phát nhạc</h4>
                    <p className="text-sm text-slate-400 max-w-md mx-auto">
                      Hãy mời Bot vào phòng thoại và gõ lệnh slash <strong className="text-indigo-400">/play [tên bài hát hoặc link]</strong> trong server Discord để bắt đầu!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {queues.map((room) => (
                    <div key={room.guildId} className="bg-slate-900 rounded-2xl border border-slate-800 shadow-lg overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                      {/* Current track banner */}
                      <div className="lg:col-span-5 bg-slate-950 text-slate-100 p-6 flex flex-col justify-between space-y-6 relative overflow-hidden">
                        {/* Decorative background overlay */}
                        <div className="absolute inset-0 opacity-20 bg-cover bg-center filter blur-sm" style={{ backgroundImage: room.currentTrack?.thumbnail ? `url(${room.currentTrack.thumbnail})` : 'none' }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/40" />

                        <div className="relative z-10 flex items-center justify-between">
                          <div>
                            <span className="text-xs bg-indigo-500/20 text-indigo-300 font-bold px-2.5 py-1 rounded-md border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
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
                                    className="w-20 h-20 rounded-xl object-cover shadow-lg border border-slate-800 flex-shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <div className="space-y-1">
                                  <h4 className="text-base font-bold text-white line-clamp-2 leading-snug">
                                    {room.currentTrack.title}
                                  </h4>
                                  <p className="text-xs text-slate-400 font-medium">
                                    Yêu cầu bởi: <span className="text-indigo-400 font-semibold">{room.currentTrack.requestedBy.username}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 space-y-1.5">
                                {/* Simulated track bar */}
                                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden shadow-inner">
                                  <div 
                                    className={`h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)] ${room.isPlaying ? 'animate-pulse' : ''}`}
                                    style={{ width: `${room.currentTrack.duration > 0 ? Math.min((room.playbackDuration / room.currentTrack.duration) * 100, 100) : 0}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-slate-400 font-semibold">
                                  <span>{new Date(room.playbackDuration * 1000).toISOString().substr(11, 8).replace(/^00:/, '')}</span>
                                  <span>{room.currentTrack.durationString}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-slate-500 text-sm py-4 italic">Hàng đợi trống...</div>
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
                      <div className="lg:col-span-7 p-6 flex flex-col justify-between bg-slate-900 border-l border-slate-800">
                        <div className="space-y-5">
                          {/* Room State toggles: Loop, Autoplay, 24/7 */}
                          <div className="flex flex-wrap gap-3">
                            {/* Loop mode dropdown selector */}
                            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 font-semibold gap-1.5 shadow-sm">
                              <span>Lặp:</span>
                              <select 
                                value={room.loopMode}
                                onChange={(e) => handleQueueControl(room.guildId, 'loop', e.target.value)}
                                className="bg-transparent font-bold text-indigo-400 focus:outline-none cursor-pointer"
                              >
                                <option value="off">Off</option>
                                <option value="track">Track (1 bài)</option>
                                <option value="queue">Queue (Hàng)</option>
                              </select>
                            </div>

                            {/* 24/7 toggler */}
                            <button
                              onClick={() => handleQueueControl(room.guildId, '247', !room.is247)}
                              className={`flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border transition duration-150 cursor-pointer gap-1.5 shadow-sm ${
                                room.is247 
                                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                              }`}
                            >
                              <span>Chế độ 24/7:</span>
                              <span>{room.is247 ? 'BẬT' : 'TẮT'}</span>
                            </button>
                          </div>

                          {/* Queue tracks list */}
                          <div className="space-y-2">
                            <div className="text-xs font-bold tracking-wider text-slate-400 uppercase">Danh sách chờ sắp tới ({room.tracks.length} bài)</div>
                            
                            {room.tracks.length <= 1 ? (
                              <div className="text-slate-500 text-xs italic bg-slate-950/50 rounded-xl p-4 border border-dashed border-slate-700">
                                Không có bài hát nào tiếp theo trong hàng đợi. Nhập thêm nhạc trong Discord!
                              </div>
                            ) : (
                              <div className="max-h-36 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                                {room.tracks.slice(1, 6).map((t, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-xs bg-slate-800 border border-slate-700/50 rounded-lg p-2 hover:bg-slate-700 transition duration-100 shadow-sm">
                                    <span className="font-semibold text-slate-300 line-clamp-1 flex-1 pr-4">
                                      {idx + 1}. {t.title}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400 font-bold flex-shrink-0">
                                      ⏱️ {t.durationString}
                                    </span>
                                  </div>
                                ))}
                                {room.tracks.length > 6 && (
                                  <div className="text-[10px] text-center text-indigo-400 font-bold bg-indigo-500/10 py-1.5 rounded-lg border border-indigo-500/20">
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


        {activeTab === 'guide' && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-md p-6 lg:p-8 space-y-8">
            <div className="flex items-center space-x-3 pb-5 border-b border-slate-800">
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Hướng dẫn Deploy chi tiết từ A - Z</h2>
                <p className="text-xs text-slate-400 font-medium">Các bước triển khai dự án lên Render Free Tier và thiết lập UptimeRobot ping</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Step 1: Export project */}
              <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/80 space-y-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md">
                  1
                </div>
                <h4 className="text-sm font-bold text-white">Đưa dự án lên GitHub</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Tải dự án về máy của bạn qua tùy chọn ZIP trong menu cài đặt AI Studio, khởi tạo một repository trên GitHub và đẩy mã nguồn lên đó.
                </p>
              </div>

              {/* Step 2: Deploy to Render */}
              <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/80 space-y-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md">
                  2
                </div>
                <h4 className="text-sm font-bold text-white">Tạo Web Service trên Render</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Liên kết tài khoản GitHub với Render.com. Chọn <strong className="text-slate-300">New +</strong> &gt; <strong className="text-slate-300">Web Service</strong>. Chọn repository chứa bot nhạc của bạn.
                </p>
              </div>

              {/* Step 3: Setup UptimeRobot */}
              <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800/80 space-y-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md">
                  3
                </div>
                <h4 className="text-sm font-bold text-white">Giữ bot online 24/7</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Đăng ký tài khoản UptimeRobot. Thêm monitor kiểu <strong className="text-slate-300">HTTPS</strong>, trỏ về link Web Service của Render với chu kỳ 5 phút/lần.
                </p>
              </div>
            </div>

            {/* Render Settings Details Section */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                Cấu hình thông số trên Render.com
              </h3>

              <div className="overflow-x-auto rounded-xl border border-slate-800 shadow-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950/50 border-b border-slate-800 font-bold text-slate-300">
                      <th className="p-3.5">Trường thông tin</th>
                      <th className="p-3.5">Giá trị cấu hình</th>
                      <th className="p-3.5 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium text-slate-400">
                    <tr>
                      <td className="p-3.5 font-bold text-slate-300">Language (Runtime)</td>
                      <td className="p-3.5 font-mono bg-slate-950/20 text-slate-400">Node</td>
                      <td className="p-3.5 text-right"></td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-bold text-slate-300">Build Command</td>
                      <td className="p-3.5 font-mono bg-slate-950/20 text-slate-400">npm install && npm run build</td>
                      <td className="p-3.5 text-right">
                        <button 
                          onClick={() => copyToClipboard('npm install && npm run build', 'build_cmd')}
                          className="text-indigo-400 hover:text-indigo-300 font-bold text-[10px]"
                        >
                          {copiedText === 'build_cmd' ? 'Đã sao chép!' : 'Sao chép'}
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-bold text-slate-300">Start Command</td>
                      <td className="p-3.5 font-mono bg-slate-950/20 text-slate-400">npm start</td>
                      <td className="p-3.5 text-right">
                        <button 
                          onClick={() => copyToClipboard('npm start', 'start_cmd')}
                          className="text-indigo-400 hover:text-indigo-300 font-bold text-[10px]"
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
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                Cấu hình Biến môi trường (Environment Variables)
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tại tab <strong className="text-slate-300">Environment</strong> trên Render, nhấn vào <strong className="text-slate-300">Add Environment Variable</strong> và thêm các biến sau:
              </p>

              <div className="bg-slate-950 text-slate-300 font-mono text-xs rounded-xl p-5 border border-slate-800 shadow-inner space-y-2.5">
                <div>
                  <span className="text-emerald-400">BOT_TOKEN</span> = <span className="text-slate-100">"Mã Token Discord Bot của bạn"</span>
                </div>
                <div>
                  <span className="text-emerald-400">CLIENT_ID</span> = <span className="text-slate-100">"Mã Client ID của bạn"</span>
                </div>
                <div>
                  <span className="text-emerald-400">NODE_ENV</span> = <span className="text-slate-100">"production"</span>
                </div>
                <div>
                  <span className="text-emerald-400">PORT</span> = <span className="text-slate-100">3000</span>
                </div>
              </div>
            </div>

            {/* UptimeRobot Detailed configuration guidelines */}
            <div className="space-y-4 pt-4 border-t border-slate-800 leading-relaxed">
              <h3 className="text-base font-bold text-white">⏰ Chi tiết tích hợp UptimeRobot</h3>
              <div className="text-xs text-slate-400 space-y-3">
                <p>
                  Render Free Tier có chế độ tự động dừng dịch vụ (ngủ đông) sau 15 phút không nhận được lưu lượng truy cập mạng nào. Điều này sẽ làm bot bị ngắt kết nối. Để duy trì bot hoạt động 24/7, hãy làm như sau:
                </p>
                <ol className="list-decimal list-inside space-y-2 pl-1.5 font-medium text-slate-400">
                  <li>Đăng ký tài khoản miễn phí tại trang <a href="https://uptimerobot.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline font-bold">UptimeRobot.com</a>.</li>
                  <li>Click vào nút <strong className="text-slate-300">+ Add New Monitor</strong> ở góc bên trái.</li>
                  <li>Thiết lập các trường thông tin:
                    <ul className="list-disc list-inside space-y-1.5 pl-5 mt-1 text-slate-500">
                      <li><strong className="text-slate-300">Monitor Type:</strong> Chọn <code className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">HTTPS</code>.</li>
                      <li><strong className="text-slate-300">Friendly Name:</strong> Đặt tên dễ nhớ (ví dụ: <code className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Discord Music Bot</code>).</li>
                      <li><strong className="text-slate-300">URL (or IP):</strong> Nhập địa chỉ link Web Service của Render.</li>
                      <li><strong className="text-slate-300">Monitoring Interval:</strong> Chọn thanh trượt <code className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Every 5 minutes</code>.</li>
                    </ul>
                  </li>
                  <li>Click <strong className="text-slate-300">Create Monitor</strong> để hoàn tất. UptimeRobot sẽ gửi request ping định kỳ để giữ cho máy chủ không bị ngủ đông!</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Tab Cấu hình (Settings) - Cookies and others */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
              <div className="flex items-center space-x-4 mb-8">
                <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
                  <Disc className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Quản lý Cookies YouTube</h2>
                  <p className="text-sm text-slate-400">Tải lên file cookies.txt để bỏ qua xác thực bot của YouTube.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                  <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    Trạng thái hiện tại
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">File tồn tại:</span>
                      {cookieInfo?.exists ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Có
                        </span>
                      ) : (
                        <span className="text-rose-400 font-bold flex items-center gap-1">
                          <XCircle className="w-4 h-4" /> Không
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Cập nhật lúc:</span>
                      <span className="text-slate-300 font-medium">
                        {cookieInfo?.lastUpdated ? new Date(cookieInfo.lastUpdated).toLocaleString('vi-VN') : 'Chưa có'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-500/5 p-6 rounded-2xl border border-indigo-500/10 flex flex-col justify-center items-center text-center">
                  <Upload className="w-8 h-8 text-indigo-400 mb-3" />
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Sử dụng các tiện ích mở rộng như "Get cookies.txt" trên Chrome/Edge để xuất file cookies từ YouTube.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="sr-only">Chọn file cookies.txt</span>
                  <div className="relative group cursor-pointer">
                    <input 
                      type="file" 
                      accept=".txt"
                      onChange={handleCookieUpload}
                      disabled={uploadingCookie}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    <div className={`w-full py-12 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-200 ${
                      uploadingCookie 
                        ? 'bg-slate-800/50 border-slate-700 opacity-50' 
                        : 'bg-slate-950/30 border-slate-800 group-hover:border-indigo-500/50 group-hover:bg-indigo-500/5'
                    }`}>
                      {uploadingCookie ? (
                        <>
                          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
                          <p className="text-sm font-bold text-slate-300">Đang tải lên...</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 mb-3 transition-colors" />
                          <p className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">
                            Nhấp để chọn hoặc kéo thả file <code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-400">cookies.txt</code>
                          </p>
                          <p className="text-xs text-slate-500 mt-2">Chỉ chấp nhận định dạng .txt</p>
                        </>
                      )}
                    </div>
                  </div>
                </label>
              </div>

              <div className="mt-8 p-6 bg-slate-950 rounded-2xl border border-slate-800">
                <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Hướng dẫn xuất Cookies (Tránh bị xoay vòng):
                </h4>
                <div className="text-xs text-slate-400 space-y-3 leading-relaxed">
                  <p>YouTube thường xuyên thay đổi cookies của tài khoản trên các tab trình duyệt đang mở như một biện pháp bảo mật. Để xuất cookies hoạt động ổn định, bạn cần xuất theo cách không bị thay đổi:</p>
                  <ol className="list-decimal list-inside space-y-2 ml-2">
                    <li>Mở một cửa sổ <strong>Ẩn danh (Incognito)</strong> mới và đăng nhập vào YouTube.</li>
                    <li>Trong cùng cửa sổ và tab đó, truy cập vào: <code className="bg-slate-800 px-1 rounded text-indigo-300">https://www.youtube.com/robots.txt</code> (đây phải là tab ẩn danh duy nhất đang mở).</li>
                    <li>Sử dụng tiện ích mở rộng để xuất cookies của <code className="text-white">youtube.com</code>.</li>
                    <li><strong>Đóng ngay</strong> cửa sổ ẩn danh đó để phiên làm việc không bao giờ được mở lại trên trình duyệt nữa.</li>
                  </ol>
                  <p className="pt-2 border-t border-slate-800/50 italic text-slate-500">Play-DL và YT-DLP sẽ tự động sử dụng file này sau khi tải lên thành công.</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
              <div className="flex items-center space-x-4 mb-8">
                <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
                  <Terminal className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Quản lý Hệ thống</h2>
                  <p className="text-sm text-slate-400">Cập nhật các thành phần lõi của bot.</p>
                </div>
              </div>

              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">Yên tâm với phiên bản yt-dlp mới nhất</h4>
                  <p className="text-xs text-slate-400 max-w-md">
                    YouTube thường xuyên cập nhật làm các phiên bản cũ bị lỗi "Sign in to confirm you're not a bot". Nhấn nút này để bot tự tải về bản vá mới nhất.
                  </p>
                </div>
                <button
                  onClick={handleUpdateYtDlp}
                  disabled={updatingYtDlp}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 shadow-lg shadow-indigo-500/20 border border-indigo-400/30 whitespace-nowrap"
                >
                  <RefreshCw className={`w-4 h-4 ${updatingYtDlp ? 'animate-spin' : ''}`} />
                  {updatingYtDlp ? 'Đang cập nhật...' : 'Cập nhật yt-dlp ngay'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
