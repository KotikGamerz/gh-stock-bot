require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');

console.log('🚀 Тест логина...');
console.log('Токен длина:', process.env.USER_TOKEN?.length);
console.log('Токен префикс:', process.env.USER_TOKEN?.substring(0, 10));

const client = new Client();

client.on('ready', () => {
    console.log('✅ УСПЕХ! Залогинился как', client.user.tag);
    console.log('📋 Серверов:', client.guilds.cache.size);
    process.exit(0);
});

client.on('error', (err) => {
    console.log('❌ Ошибка клиента:', err.message);
});

client.login(process.env.USER_TOKEN).catch(err => {
    console.log('❌ Ошибка логина:', err.message);
    console.log('❌ Код ошибки:', err.code);
    process.exit(1);
});

// Таймаут на всякий случай
setTimeout(() => {
    console.log('❌ Таймаут - логин не произошёл за 30 секунд');
    process.exit(1);
}, 30000);








