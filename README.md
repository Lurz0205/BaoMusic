# 🎵 Discord Music Bot - Web Control Panel

Một Discord Music Bot **production-ready**, được tối ưu hóa cực kỳ nhẹ RAM và CPU, khởi động cực nhanh và phát nhạc gần như ngay lập tức. Dự án được phát triển hoàn toàn bằng **discord.js v14**, **@discordjs/voice**, và **play-dl** (không sử dụng Lavalink, youtube-dl cũ, hoặc ytdl-core lỗi thời).

Đặc biệt, dự án tích hợp một **Web Control Panel (Dashboard)** tuyệt đẹp bằng React + Express, cho phép bạn điều khiển trình phát từ xa, cấu hình bot token trực quan và tải lên file `cookies.txt` để bỏ qua lỗi chặn YouTube cực kỳ dễ dàng.

---

## ✨ Tính Năng Nổi Bật

- **🎵 Đa Nền Tảng**: Hỗ trợ phát nhạc từ YouTube (Video/Playlist), Spotify (Bài hát/Album/Playlist), và SoundCloud (Bài hát/Playlist).
- **🚀 Siêu Nhẹ & Tối Ưu**: Được tinh chỉnh chạy cực mượt và ổn định trên tài nguyên giới hạn của **Render Free Tier**.
- **🌐 Web Control Panel**: Giao diện trực quan theo dõi trạng thái, độ trễ, số lượng guild, và danh sách các phòng đang phát nhạc kèm tính năng Remote Control trực tiếp.
- **🔍 Autocomplete**: Tính năng tìm kiếm gợi ý bài hát tự động khi gõ `/play` siêu nhanh, mượt mà và chống spam request.
- **📍 Treo Phòng 24/7**: Lệnh `/247` giữ bot luôn ở lại trong phòng thoại kể cả khi kết thúc nhạc hoặc khởi động lại.
- **🍪 Vượt Chặn YouTube**: Hỗ trợ upload trực tiếp file `cookie.txt` thông qua giao diện Web để giải quyết vấn đề chặn phát nhạc của YouTube.
- **⚡ Slash Commands**: Sử dụng 100% Slash Commands thế hệ mới (`/play`, `/skip`, `/stop`, `/pause`, `/resume`, `/queue`, `/nowplaying`, `/shuffle`, `/remove`, `/clear`, `/loop`, `/volume`, `/join`, `/leave`, `/247`, `/help`, `/ping`).

---

## 🛠️ Danh Sách Lệnh (Slash Commands)

| Lệnh | Mô Tả |
| :--- | :--- |
| `/play [tên/link]` | Phát nhạc từ YouTube, Spotify, SoundCloud hoặc tìm kiếm. Hỗ trợ tự động gợi ý kết quả! |
| `/skip` | Bỏ qua bài hát hiện tại và phát bài tiếp theo. |
| `/stop` | Dừng nhạc, xóa sạch hàng đợi và hủy trình phát nhạc. |
| `/pause` | Tạm dừng phát nhạc. |
| `/resume` | Tiếp tục phát nhạc bị tạm dừng. |
| `/queue` | Xem danh sách bài hát đang chờ trong hàng đợi. |
| `/nowplaying` | Xem chi tiết bài hát đang phát cùng tiến trình phát (`▬▬🔘▬▬`). |
| `/shuffle` | Trộn ngẫu nhiên danh sách hàng chờ. |
| `/remove [vị trí]` | Xóa một bài hát cụ thể khỏi danh sách chờ bằng số thứ tự. |
| `/clear` | Xóa toàn bộ hàng đợi (giữ lại bài hát đang phát). |
| `/loop [chế độ]` | Thiết lập chế độ lặp (Tắt, Lặp 1 Bài, Lặp Hàng Đợi). |
| `/volume [0-100]` | Điều chỉnh âm lượng phát nhạc của bot. |
| `/join` | Mời bot tham gia vào kênh thoại của bạn. |
| `/leave` | Trục xuất bot ra khỏi kênh thoại. |
| `/247 [bật/tắt]` | Kích hoạt hoặc hủy kích hoạt chế độ treo phòng thoại 24/7. |
| `/ping` | Kiểm tra độ trễ kết nối (API latency & WebSocket ping). |
| `/help` | Xem bảng hướng dẫn chi tiết các lệnh. |

---

## 🚀 Hướng Dẫn Deploy Lên Render Free Tier

Để đưa dự án hoạt động ổn định và giữ bot online liên tục 24/7 trên Render, hãy làm theo các bước sau:

### Bước 1: Chuẩn bị mã nguồn trên GitHub
1. Tải toàn bộ mã nguồn này về máy của bạn dưới dạng file `.zip`.
2. Tạo một repository mới trên tài khoản **GitHub** của bạn (chế độ **Private** hoặc **Public**).
3. Đẩy toàn bộ mã nguồn lên repository vừa tạo.

### Bước 2: Deploy lên Render.com
1. Đăng nhập vào trang quản trị **[Render.com](https://render.com/)** (liên kết qua GitHub).
2. Nhấn nút **New +** ở góc phải và chọn **Web Service**.
3. Chọn repository chứa mã nguồn bot nhạc của bạn vừa đẩy lên GitHub.
4. Thiết lập các thông số cơ bản sau:
   - **Language (Runtime)**: `Node`
   - **Region**: Chọn khu vực gần bạn nhất (ví dụ: `Singapore` hoặc `Oregon`).
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Chọn `Free` ($0/month).

### Bước 3: Cấu hình Biến Môi Trường (Environment Variables)
Chuyển qua tab **Environment** tại trang quản trị Web Service vừa tạo trên Render, chọn **Add Environment Variable** và thêm các biến sau:
- `BOT_TOKEN`: Mã Token của Discord Bot (Lấy từ Discord Developer Portal).
- `CLIENT_ID`: Application ID của Discord Bot (Lấy từ Discord Developer Portal).
- `NODE_ENV`: Đặt giá trị là `production`.
- `PORT`: Đặt giá trị là `3000`.
- `COOKIE_PATH`: Đặt giá trị là `cookies/cookie.txt` (Hệ thống sẽ tự động dùng cookie được tải lên từ giao diện web).

Nhấn **Save Changes** để lưu cấu hình. Render sẽ tự động tiến hành build và khởi động bot nhạc của bạn!

### Bước 4: Thiết lập UptimeRobot để giữ bot thức tỉnh 24/7
Render Free Tier có cơ chế tự động ngủ đông sau 15 phút không nhận được lưu lượng truy cập mạng, điều này sẽ làm bot bị ngắt kết nối khỏi Discord. Để giữ bot luôn hoạt động ổn định:
1. Đăng ký tài khoản miễn phí tại **[UptimeRobot](https://uptimerobot.com/)**.
2. Click vào **+ Add New Monitor** ở menu bên trái.
3. Cấu hình các mục sau:
   - **Monitor Type**: Chọn `HTTPS`.
   - **Friendly Name**: Đặt tên bất kỳ (ví dụ: `My Discord Music Bot`).
   - **URL (or IP)**: Điền liên kết Web Service của Render (ví dụ: `https://ten-bot-cua-ban.onrender.com/`).
   - **Monitoring Interval**: Đặt là `Every 5 minutes` (Mỗi 5 phút một lần).
4. Nhấn **Create Monitor** để hoàn thành. UptimeRobot sẽ tự động gửi request "thức tỉnh" Render 5 phút một lần để bot luôn trực tuyến và sẵn sàng phục vụ!

---

## 🍪 Hướng Dẫn Thiết Lập Cookies Tránh Lỗi Chặn YouTube

Để giải quyết tình trạng YouTube chặn các tài khoản bot hoặc các bài hát bị giới hạn độ tuổi/yêu cầu đăng nhập, bạn có thể tải lên file cookies từ tài khoản YouTube cá nhân:

1. Cài đặt tiện ích mở rộng Chrome/Firefox tên là: **Get cookies.txt LOCALLY** hoặc bất kỳ tiện ích trích xuất cookie định dạng Netscape.
2. Đăng nhập tài khoản Google cá nhân và mở trang **[YouTube.com](https://www.youtube.com)**.
3. Click vào icon tiện ích mở rộng và tải về file cookie định dạng `.txt` Netscape.
4. Mở file vừa tải về bằng Notepad, sao chép (Copy) toàn bộ văn bản trong đó.
5. Truy cập vào giao diện quản trị Web Dashboard của bot nhạc, chuyển sang tab **Cấu hình & Cookies**, dán nội dung vừa sao chép vào phần **Nội dung file cookies.txt** và nhấn **Cập nhật**.
6. Hệ thống sẽ tự động lưu và khởi động lại trình chơi nhạc để áp dụng cookie giúp bypass chặn YouTube cực kỳ an toàn!

---

## 🛡️ Vượt Lỗi "Sign in to confirm you're not a bot" (PO Token & Visitor Data)

Khi deploy bot nhạc lên các máy chủ cloud (như Google Cloud, AWS, Render), YouTube thường chặn toàn bộ IP của dải máy chủ này và yêu cầu xác thực bot bằng **PO Token (Proof of Origin Token)**. Để vượt qua chặn này, bạn hãy cấu hình thêm hai biến môi trường `YT_PO_TOKEN` và `YT_VISITOR_DATA` trong file `.env` hoặc cấu hình Web Service:

### Cách lấy PO Token và Visitor Data bằng Google Chrome / Edge:
1. Đăng nhập tài khoản YouTube của bạn trên trình duyệt.
2. Nhấn **F12** (hoặc click chuột phải chọn **Inspect/Kiểm tra**) để mở Developer Tools, chuyển sang tab **Network** (Mạng).
3. Tìm kiếm từ khóa `v1/player` hoặc `player` trong ô lọc tìm kiếm.
4. Chọn một request bất kỳ có tên là `player` và xem phần **Payload** (hoặc **Request Body** dạng JSON).
5. Tìm kiếm trường dữ liệu sau:
   - **PO Token**: Tìm mục `serviceIntegrityDimensions` -> `poToken`. Sao chép chuỗi ký tự dài (bắt đầu bằng `Mn...`).
   - **Visitor Data**: Tìm mục `context` -> `client` -> `visitorData`. Sao chép chuỗi ký tự ngắn hơn (bắt đầu bằng `Cg...`).
6. Dán hai chuỗi này vào các biến môi trường của ứng dụng:
   - `YT_PO_TOKEN` = chuỗi PO Token thu thập được.
   - `YT_VISITOR_DATA` = chuỗi Visitor Data thu thập được.

Khi cấu hình thành công hai biến này, `yt-dlp` của bot nhạc sẽ tự động sử dụng chữ ký gốc của trình duyệt bạn giúp phát nhạc 100% mượt mà không bao giờ bị chặn nữa!

---

## 🔧 Yêu Cầu Gateway Intents Trên Discord Developer Portal

Để bot hoạt động và phản hồi chính xác, bạn **phải** bật các Intent đặc quyền trong phần cài đặt Bot trên Discord Portal:
1. Mở trang quản trị ứng dụng Discord tại mục **[Bot Settings](https://discord.com/developers/applications)**.
2. Tìm kiếm phần **Privileged Gateway Intents**.
3. Bật kích hoạt cả 3 tùy chọn:
   - `Presence Intent`
   - `Server Members Intent`
   - `Message Content Intent`
4. Nhấn **Save Changes** để hoàn thành.

---

## 👨‍💻 Phát Triển Dưới Local

Nếu muốn chạy thử nghiệm trực tiếp dưới máy cục bộ của bạn:

```bash
# Cài đặt toàn bộ các thư viện
npm install

# Khởi chạy bot và giao diện web dưới môi trường Dev
npm run dev

# Thực hiện build dự án cho bản production
npm run build

# Chạy bản build chính thức
npm start
```

Dự án sẽ tự động kích hoạt máy chủ tại cổng `http://localhost:3000` để bạn theo dõi và điều khiển bot nhạc cực kỳ dễ dàng!
