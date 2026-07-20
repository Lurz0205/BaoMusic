import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export async function execute(interaction: ChatInputCommandInteraction) {
  const dashboardUrl = 'https://baomusic-4rk8.onrender.com';
  
  await interaction.reply({
    content: `🌐 **Bảng điều khiển Web của Bot:**\n${dashboardUrl}\n\n*Bạn có thể điều khiển nhạc, quản lý hàng đợi và cấu hình bot tại đây.*`,
    ephemeral: true
  });
}

export const dashboardCommand = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Lấy link truy cập vào bảng điều khiển Web của Bot'),
  execute
};
