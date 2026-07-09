import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Kiểm tra độ trễ (latency) của bot.'),
    
  async execute(interaction: ChatInputCommandInteraction) {
    const sent = await interaction.reply({ content: 'Đang kiểm tra...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsPing = interaction.client.ws.ping;
    
    await interaction.editReply(
      `🏓 **Pong!**\n` +
      `- Độ trễ phản hồi: \`${latency}ms\`\n` +
      `- Độ trễ Gateway (WebSocket): \`${wsPing}ms\``
    );
  }
};
