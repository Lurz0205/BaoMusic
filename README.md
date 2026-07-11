# 🎵 Discord Music Bot - Web Control Panel (Ultimate Edition)

Một Discord Music Bot **production-ready** mạnh mẽ, được tối ưu hóa cực kỳ nhẹ RAM và CPU, khởi động nhanh và phát nhạc chất lượng cao. Dự án được phát triển bằng **discord.js v14**, **@discordjs/voice**, và sử dụng lõi phát nhạc **yt-dlp** hiện đại nhất.

Đặc biệt, dự án tích hợp một **Web Control Panel (Dashboard)** tuyệt đẹp bằng React + Express, cho phép bạn điều khiển trình phát từ xa, quản lý hàng đợi thời gian thực và cấu hình hệ thống chuyên sâu.

---

## ✨ Tính Năng Nổi Bật

- **🎵 Âm Thanh Chất Lượng Cao**: Sử dụng stream Opus 48kHz trực tiếp từ `yt-dlp` với các tham số tối ưu hóa cho chất lượng audio tốt nhất (`--audio-quality 0`).
- **🚀 Siêu Nhẹ & Tối Ưu**: Được tinh chỉnh để chạy mượt mà trên các môi trường giới hạn tài nguyên như **Cloud Run**, **Render**, hoặc **Heroku**.
- **🌐 Web Control Panel Toàn Diện**: 
  - Theo dõi trạng thái bot, độ trễ, và số lượng server.
  - Điều khiển nhạc thời gian thực: Play, Skip, Pause, Resume, Stop, Volume, Loop, 24/7.
  - Thanh tiến trình nhạc (Progress Bar) mượt mà được đồng bộ hóa.
- **🔍 Tìm Kiếm Thông Minh**: Hỗ trợ Autocomplete khi gõ lệnh `/play` trên Discord, giúp tìm kiếm bài hát cực nhanh.
- **🎼 Đa Nền Tảng**: 
  - **YouTube**: Hỗ trợ Video, Playlist, Shorts, và Livestream.
  - **Spotify**: Hỗ trợ Link bài hát, Album, Playlist (Tự động chuyển đổi sang YouTube với metadata chính xác).
  - **SoundCloud**: Hỗ trợ Link bài hát và Playlist.
- **📍 Treo Phòng 24/7**: Giữ bot luôn ở lại trong phòng thoại kể cả khi không có người nghe hoặc khi bot khởi động lại.
- **🍪 Quản Lý Cookies Chuyên Sâu**: Giao diện upload `cookies.txt` trực quan kèm hướng dẫn trích xuất cookies nâng cao để bypass mọi rào cản của YouTube.

---

## 🛠️ Danh Sách Lệnh (Slash Commands)

| Lệnh | Mô Tả |
| :--- | :--- |
| `/play [tên/link]` | Phát nhạc từ mọi nguồn. Hỗ trợ tự động gợi ý kết quả khi gõ tên bài hát! |
| `/skip` | Bỏ qua bài hát hiện tại. |
| `/stop` | Dừng nhạc và xóa sạch hàng đợi. |
| `/pause` / `/resume` | Tạm dừng hoặc tiếp tục phát nhạc. |
| `/queue` | Xem danh sách các bài hát đang chờ. |
| `/nowplaying` | Xem chi tiết bài hát đang phát kèm thanh tiến trình trực quan. |
| `/volume [0-100]` | Điều chỉnh âm lượng (mặc định 100%). |
| `/loop [chế độ]` | Chế độ lặp: Tắt, 1 Bài, Toàn bộ Hàng đợi. |
| `/247 [bật/tắt]` | Giữ bot luôn trực tuyến trong kênh thoại. |
| `/ping` | Kiểm tra tốc độ phản hồi của bot. |

---

## 🌐 Web Dashboard & Điều Khiển Từ Xa

Giao diện Dashboard cung cấp quyền kiểm soát tuyệt đối mà không cần mở Discord:
- **Trạng thái Real-time**: Xem bài hát nào đang phát ở từng server khác nhau.
- **Remote Control**: Nhấn Skip, Pause hoặc thay đổi âm lượng ngay trên trình duyệt.
- **Cấu hình Cookies**: Dán nội dung `cookies.txt` trực tiếp để giải quyết lỗi "Sign in to confirm you're not a bot".

---

## 🍪 Hướng Dẫn Trích Xuất Cookies (Bypass Chặn YouTube)

YouTube thường xuyên thay đổi cookies để chặn bot. Để xuất cookies hoạt động ổn định, hãy làm theo phương pháp **Ẩn danh (Incognito)**:

1. Mở một cửa sổ **Ẩn danh (Incognito)** mới trên trình duyệt.
2. Đăng nhập vào YouTube bằng tài khoản của bạn.
3. Trong cùng cửa sổ đó, truy cập vào: `https://www.youtube.com/robots.txt`.
4. Sử dụng tiện ích mở rộng (như *Get cookies.txt LOCALLY*) để xuất cookies của `youtube.com`.
5. **Đóng ngay** cửa sổ ẩn danh đó (Không được mở lại phiên này trên trình duyệt nữa).
6. Copy nội dung file và dán vào phần cấu hình trên Dashboard của Bot.

---

## 🚀 Cài Đặt & Triển Khai

### 1. Biến Môi Trường (Environment Variables)

Tạo file `.env` hoặc cấu hình trên Hosting của bạn:

| Biến | Mô Tả |
| :--- | :--- |
| `BOT_TOKEN` | Token lấy từ Discord Developer Portal. |
| `CLIENT_ID` | Application ID của Bot. |
| `SPOTIFY_CLIENT_ID` | (Tùy chọn) Để lấy metadata Spotify chính xác hơn. |
| `SPOTIFY_CLIENT_SECRET` | (Tùy chọn) Để lấy metadata Spotify chính xác hơn. |
| `PORT` | Cổng chạy Web Dashboard (Mặc định 3000). |

### 2. Triển Khai Local

```bash
# Cài đặt dependencies
npm install

# Chạy môi trường phát triển (Auto-reload)
npm run dev

# Build cho Production
npm run build

# Chạy bản Production
npm start
```

### 3. Triển Khai Cloud (Render/Cloud Run)
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Port**: 3000 (HTTP)

---

## 🔧 Yêu Cầu Gateway Intents

Đảm bảo bạn đã bật các **Intents** sau trong [Discord Developer Portal](https://discord.com/developers/applications):
- `Presence Intent`
- `Server Members Intent`
- `Message Content Intent`

---

## 📜 Giấy Phép & Đóng Góp

Dự án được phát triển phục vụ mục đích giải trí và học tập. Mọi đóng góp (Pull Request) đều được chào đón!
