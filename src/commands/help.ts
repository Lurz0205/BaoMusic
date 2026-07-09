import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem danh sách tất cả các lệnh và hướng dẫn sử dụng bot.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎵 Discord Music Bot Help Menu')
      .setDescription('Bot phát nhạc chất lượng cao, độ trễ thấp và hoàn toàn miễn phí!')
      .addFields(
        { 
          name: '🎤 Lệnh kết nối & hệ thống', 
          value: '`join`: Mời bot vào phòng Voice của bạn.\n`leave`: Cho bot rời phòng Voice.\n`247`: Kích hoạt chế độ treo phòng 24/7.\n`ping`: Kiểm tra độ trễ mạng.\n`help`: Xem bảng hướng dẫn này.' 
        },
        { 
          name: '🎶 Lệnh điều khiển nhạc', 
          value: '`play`: Phát nhạc qua tên bài hát, link YT/Spotify/Soundcloud (hỗ trợ gợi ý tự động!).\n`pause`: Tạm dừng phát nhạc.\n`resume`: Tiếp tục phát nhạc.\n`skip`: Bỏ qua bài hát hiện tại.\n`previous`: Phát lại bài hát trước đó.\n`stop`: Dừng phát và xóa toàn bộ hàng đợi.' 
        },
        { 
          name: '📋 Quản lý hàng đợi (Queue)', 
          value: '`queue`: Xem danh sách nhạc đang chờ.\n`nowplaying`: Xem chi tiết bài hát đang phát.\n`loop`: Chuyển chế độ lặp (Tắt, Lặp 1 Bài, Lặp Hàng Đợi).\n`shuffle`: Tráo trộn thứ tự các bài trong hàng đợi.\n`remove`: Xóa bài hát tại vị trí chỉ định.\n`clear`: Xóa sạch hàng đợi (giữ lại bài đang phát).\n`volume`: Điều chỉnh âm lượng bot (0-100%).' 
        }
      )
      .setFooter({ text: 'Gợi ý: Hãy nhập /play để tìm kiếm và phát nhạc nhanh chóng!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
