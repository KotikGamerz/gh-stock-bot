require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');

console.log('🚀 Тестовый запуск...');
console.log('Токен есть:', !!process.env.USER_TOKEN);
console.log('Длина токена:', process.env.USER_TOKEN?.length);

const client = new Client();

client.on('ready', () => {
    console.log('✅ УСПЕХ! Залогинился как', client.user.tag);
    console.log('📋 Серверов:', client.guilds.cache.size);
    process.exit(0);
});

client.on('error', (err) => {
    console.log('❌ Ошибка:', err.message);
});

client.login(process.env.USER_TOKEN).catch(err => {
    console.log('❌ Фатальная ошибка:', err.message);
    process.exit(1);
});











