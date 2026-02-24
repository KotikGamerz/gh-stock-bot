require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');
const { fetch } = require('undici');
const fs = require('fs').promises;
const express = require('express');

// ===== Express сервер для Render =====
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🌱 Garden Horizons Bot is running!');
});

app.listen(port, () => {
    console.log(`✅ Web server running on port ${port}`);
});
// ======================================

const client = new Client();

// Эмодзи для всего
const EMOJIS = {
    // Семена
    'Carrot': '🥕',
    'Corn': '🌽',
    'Onion': '🧅',
    'Strawberry': '🍓',
    'Mushroom': '🍄',
    'Beetroot': '🟣',
    'Tomato': '🍅',
    'Apple': '🍎',
    'Rose': '🌹',
    'Wheat': '🌾',
    'Banana': '🍌',
    'Plum': '🟣',
    'Potato': '🥔',
    'Cabbage': '🥬',
    'Cherry': '🍒',
    // Gear
    'Watering Can': '💧',
    'Basic Sprinkler': '💦',
    'Harvest Bell': '🔔',
    'Turbo Sprinkler': '⚡',
    'Favorite Tool': '⭐',
    'Super Sprinkler': '💎',
    // Погода
    'Fog': '🌫️',
    'Rain': '☔',
    'Sandstorm': '🏜️',
    'Snow': '❄️',
    'Starfall': '🌠',
    'Storm': '⛈️'
};

// Кэш для имён ролей
const roleNameCache = new Map();

// Хранилище данных
let stockData = {
    seeds: [],
    gear: [],
    weather: null,
    lastUpdate: null,
    messageId: null,
    source: 'official',
    downNotified: false
};

// ===== ЗАГРУЗКА/СОХРАНЕНИЕ СОСТОЯНИЯ =====
async function loadState() {
    try {
        const data = await fs.readFile('state.json', 'utf8');
        stockData = JSON.parse(data);
        console.log('📂 Загружено состояние');
    } catch (error) {
        console.log('🆕 Новое состояние');
    }
}

async function saveState() {
    await fs.writeFile('state.json', JSON.stringify(stockData, null, 2));
}

// ===== ПОИСК РОЛИ НА ВСЕХ СЕРВЕРАХ =====
async function findRoleName(roleId) {
    if (roleNameCache.has(roleId)) {
        return roleNameCache.get(roleId);
    }
    
    console.log(`🔍 Ищу роль ${roleId}...`);
    
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const role = await guild.roles.fetch(roleId);
            if (role) {
                console.log(`✅ Нашёл: ${role.name} на сервере ${guild.name}`);
                roleNameCache.set(roleId, role.name);
                return role.name;
            }
        } catch (error) {
            // Игнорируем
        }
    }
    
    console.log(`❌ Роль ${roleId} не найдена`);
    roleNameCache.set(roleId, null);
    return null;
}

// ===== ПАРСИНГ КОМПОНЕНТОВ =====
function extractTextFromComponents(components) {
    if (!components || components.length === 0) return '';
    
    let text = '';
    
    function extract(comp) {
        if (comp.content) {
            text += comp.content + '\n';
        }
        if (comp.components) {
            comp.components.forEach(extract);
        }
    }
    
    components.forEach(extract);
    return text;
}

// ===== ПАРСИНГ ОФИЦИАЛЬНОГО БОТА (СЕМЕНА) =====
async function parseOfficialSeedChannel() {
    try {
        const channel = client.channels.cache.get(process.env.SEED_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.components.length) return null;
        
        // Проверка на свежесть (5 минут)
        const messageAge = Date.now() - msg.createdTimestamp;
        const maxAge = 5 * 60 * 1000;
        
        if (messageAge > maxAge) {
            console.log(`⏰ Сообщение семян слишком старое (${Math.round(messageAge/60000)} мин)`);
            return null;
        }
        
        const text = extractTextFromComponents(msg.components);
        const lines = text.split('\n');
        const items = [];
        
        for (const line of lines) {
            const match = line.match(/<@&(\d+)>\s*\(x(\d+)\)/);
            if (match) {
                const roleId = match[1];
                const count = parseInt(match[2]);
                const name = await findRoleName(roleId);
                
                if (name) {
                    items.push({ 
                        name: name, 
                        count: count,
                        roleId: roleId
                    });
                }
            }
        }
        
        return items.length ? items : null;
    } catch (error) {
        console.error('Ошибка парсинга официальных семян:', error.message);
        return null;
    }
}

// ===== ПАРСИНГ ОФИЦИАЛЬНОГО БОТА (ГИР) =====
async function parseOfficialGearChannel() {
    try {
        const channel = client.channels.cache.get(process.env.GEAR_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.components.length) return null;
        
        // Проверка на свежесть (5 минут)
        const messageAge = Date.now() - msg.createdTimestamp;
        const maxAge = 5 * 60 * 1000;
        
        if (messageAge > maxAge) {
            console.log(`⏰ Сообщение гира слишком старое (${Math.round(messageAge/60000)} мин)`);
            return null;
        }
        
        const text = extractTextFromComponents(msg.components);
        const lines = text.split('\n');
        const items = [];
        
        for (const line of lines) {
            const match = line.match(/<@&(\d+)>\s*\(x(\d+)\)/);
            if (match) {
                const roleId = match[1];
                const count = parseInt(match[2]);
                const name = await findRoleName(roleId);
                
                if (name) {
                    items.push({ 
                        name: name, 
                        count: count,
                        roleId: roleId
                    });
                }
            }
        }
        
        return items.length ? items : null;
    } catch (error) {
        console.error('Ошибка парсинга официального гира:', error.message);
        return null;
    }
}

// ===== ПАРСИНГ ОФИЦИАЛЬНОГО БОТА (ПОГОДА) =====
async function parseOfficialWeatherChannel() {
    try {
        const channel = client.channels.cache.get(process.env.WEATHER_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.components.length) return null;
        
        // Проверка на свежесть (5 минут)
        const messageAge = Date.now() - msg.createdTimestamp;
        const maxAge = 5 * 60 * 1000;
        
        if (messageAge > maxAge) {
            console.log(`⏰ Сообщение погоды слишком старое (${Math.round(messageAge/60000)} мин)`);
            return null;
        }
        
        const text = extractTextFromComponents(msg.components);
        
        const weatherMatch = text.match(/now @?(\w+)/i);
        const startMatch = text.match(/start[:\s]+(\d{1,2}:\d{2})/i);
        const endMatch = text.match(/end[:\s]+(\d{1,2}:\d{2})/i);
        
        if (weatherMatch) {
            return {
                weather: weatherMatch[1],
                startTime: startMatch ? startMatch[1] : null,
                endTime: endMatch ? endMatch[1] : null
            };
        }
        
        return null;
    } catch (error) {
        console.error('Ошибка парсинга погоды:', error.message);
        return null;
    }
}

// ===== ПАРСИНГ BACKUP БОТА (СЕМЕНА) =====
async function parseBackupSeedChannel() {
    try {
        console.log('\n🔍 Парсинг backup семян...');
        
        const channel = client.channels.cache.get(process.env.BACKUP_SEED_ID);
        if (!channel) {
            console.log('❌ Канал backup семян не найден');
            return null;
        }
        
        const messages = await channel.messages.fetch({ limit: 1 }); // БЕРЁМ ТОЛЬКО 1
        const msg = messages.first();
        
        if (!msg || !msg.embeds || !msg.embeds.length) {
            console.log('❌ Нет embed в последнем сообщении');
            return null;
        }
        
        const embed = msg.embeds[0];
        const items = [];
        
        if (embed.description) {
            const lines = embed.description.split('\n');
            
            for (const line of lines) {
                // Убираем эмодзи и спецсимволы
                const cleanLine = line.replace(/[•\s]/g, '').trim();
                const match = cleanLine.match(/(\w+)\s*x(\d+)/i);
                
                if (match) {
                    items.push({
                        name: match[1],
                        count: parseInt(match[2])
                    });
                }
            }
        }
        
        console.log(`📊 Найдено предметов: ${items.length}`);
        return items.length ? items : null;
        
    } catch (error) {
        console.error('❌ Ошибка парсинга backup семян:', error);
        return null;
    }
}

// ===== ПАРСИНГ BACKUP БОТА (ГИР) ======
async function parseBackupGearChannel() {
    try {
        console.log('\n🔍 Парсинг backup гира...');
        
        const channel = client.channels.cache.get(process.env.BACKUP_GEAR_ID);
        if (!channel) {
            console.log('❌ Канал backup гира не найден');
            return null;
        }
        
        const messages = await channel.messages.fetch({ limit: 1 }); // ТОЛЬКО 1
        const msg = messages.first();
        
        if (!msg || !msg.embeds || !msg.embeds.length) {
            console.log('❌ Нет embed в последнем сообщении');
            return null;
        }
        
        const embed = msg.embeds[0];
        const items = [];
        
        if (embed.description) {
            const lines = embed.description.split('\n');
            
            for (const line of lines) {
                const cleanLine = line.replace(/[•\s]/g, '').trim();
                const withoutEmoji = cleanLine.replace(/[^\w\s]/g, '').trim();
                const match = withoutEmoji.match(/([\w\s]+)\s*x(\d+)/i);
                
                if (match) {
                    items.push({
                        name: match[1].trim(),
                        count: parseInt(match[2])
                    });
                }
            }
        }
        
        console.log(`📊 Найдено предметов: ${items.length}`);
        return items.length ? items : null;
        
    } catch (error) {
        console.error('❌ Ошибка парсинга backup гира:', error);
        return null;
    }
}

// ===== ОТПРАВКА В DISCORD =====
async function sendToDiscord() {
    if (!stockData.seeds.length && !stockData.gear.length && !stockData.weather) {
        console.log('⏳ Нет данных для отправки');
        return;
    }
    
    // ТВОЙ СЕРВЕР ПО ID
    const myGuild = client.guilds.cache.get('1253393202053124281');
    
    let pingText = '';
    
    // Пинги делаем ТОЛЬКО в official режиме
    if (stockData.source === 'official' && myGuild) {
        for (const item of stockData.gear) {
            if (item.roleId) {
                const myRole = myGuild.roles.cache.find(r => r.name === item.name);
                if (myRole) {
                    pingText += `<@&${myRole.id}> `;
                }
            }
        }
        for (const item of stockData.seeds) {
            if (item.roleId) {
                const myRole = myGuild.roles.cache.find(r => r.name === item.name);
                if (myRole) {
                    pingText += `<@&${myRole.id}> `;
                }
            }
        }
    }
    
    const fields = [];
    
    // Семена
    if (stockData.seeds.length) {
        const seedText = stockData.seeds
            .map(item => `• ${item.name} ${EMOJIS[item.name] || ''} — ${item.count}`)
            .join('\n');
        
        fields.push({
            name: '🌾 SEEDS',
            value: seedText,
            inline: false
        });
    }
    
    // Гир
    if (stockData.gear.length) {
        const gearText = stockData.gear
            .map(item => `• ${item.name} ${EMOJIS[item.name] || ''} — ${item.count}`)
            .join('\n');
        
        fields.push({
            name: '⚙️ GEAR',
            value: gearText,
            inline: false
        });
    }
    
    // Погода (только если есть и это official режим)
    if (stockData.weather && stockData.source === 'official') {
        const weather = stockData.weather;
        const weatherEmoji = EMOJIS[weather.weather] || '☁️';
        
        let timeLeft = '';
        if (weather.endTime) {
            const now = new Date();
            const [hours, minutes] = weather.endTime.split(':').map(Number);
            const end = new Date();
            end.setHours(hours, minutes, 0);
            
            if (end < now) {
                end.setDate(end.getDate() + 1);
            }
            
            const minsLeft = Math.round((end - now) / 60000);
            timeLeft = ` (${minsLeft} min left)`;
        }
        
        fields.push({
            name: '☁️ WEATHER',
            value: `• ${weather.weather} ${weatherEmoji}\n• Started: ${weather.startTime || '??'}\n• Ends: ${weather.endTime || '??'}${timeLeft}`,
            inline: false
        });
    }
    
    // Добавляем текст о backup режиме если нужно
    let footerText = `Last update: ${new Date().toLocaleTimeString()} UTC`;
    if (stockData.source === 'backup') {
        footerText += ' ⚠️ Backup mode';
    }
    
    const message = {
        content: pingText.trim(),
        embeds: [{
            title: '🌱 GARDEN HORIZONS | STOCK',
            color: 0x00FF00,
            fields: fields,
            footer: {
                text: footerText
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    // В backup режиме добавляем предупреждение внизу
    if (stockData.source === 'backup') {
        message.embeds[0].fields.push({
            name: '⚠️ Backup Mode',
            value: 'Bot is running in backup mode. Some information (weather, role pings) may be missing.',
            inline: false
        });
    }
    
    try {
        if (stockData.messageId) {
            await axios.patch(
                `${process.env.TARGET_WEBHOOK_URL}/messages/${stockData.messageId}`,
                message
            );
            console.log(`✏️ Сообщение обновлено (${stockData.source} mode)`);
        } else {
            const response = await axios.post(process.env.TARGET_WEBHOOK_URL, message);
            stockData.messageId = response.data.id;
            await saveState();
            console.log(`📨 Новое сообщение создано (${stockData.source} mode)`);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки:', error.message);
        if (error.response?.status === 404) {
            stockData.messageId = null;
            await saveState();
        }
    }
}

// ===== ОСНОВНАЯ ПРОВЕРКА =====
async function checkAll() {
    console.log(`\n🕒 ${new Date().toLocaleTimeString()} - Проверка...`);
    
    // 1️⃣ Сначала проверяем официального бота
    let newSeeds = await parseOfficialSeedChannel();
    let newGear = await parseOfficialGearChannel();
    let newWeather = await parseOfficialWeatherChannel();
    let source = 'official';
    let hasData = false;
    
    // 2️⃣ Если официальный бот не работает, проверяем backup
    if (!newSeeds && !newGear) {
        console.log('⚠️ Официальный бот молчит, пробую backup...');
        newSeeds = await parseBackupSeedChannel();
        newGear = await parseBackupGearChannel();
        newWeather = null;
        source = 'backup';
    }
    
    // Проверяем есть ли хоть какие-то данные
    if (newSeeds || newGear || newWeather) {
        hasData = true;
    }
    
    let changed = false;
    
    if (newSeeds) {
        if (JSON.stringify(newSeeds) !== JSON.stringify(stockData.seeds)) {
            console.log(`🔄 Семена изменились (${source} mode)`);
            stockData.seeds = newSeeds;
            changed = true;
        }
    } else {
        if (stockData.seeds.length > 0) {
            stockData.seeds = [];
            changed = true;
        }
    }
    
    if (newGear) {
        if (JSON.stringify(newGear) !== JSON.stringify(stockData.gear)) {
            console.log(`🔄 Гир изменился (${source} mode)`);
            stockData.gear = newGear;
            changed = true;
        }
    } else {
        if (stockData.gear.length > 0) {
            stockData.gear = [];
            changed = true;
        }
    }
    
    if (newWeather && source === 'official') {
        if (JSON.stringify(newWeather) !== JSON.stringify(stockData.weather)) {
            console.log('🔄 Погода изменилась');
            stockData.weather = newWeather;
            changed = true;
        }
    } else {
        if (stockData.weather) {
            stockData.weather = null;
            changed = true;
        }
    }
    
    if (changed && hasData) {
        stockData.source = source;
        stockData.lastUpdate = new Date().toISOString();
        await saveState();
        await sendToDiscord();
    } else if (!hasData) {
        console.log('⚠️ Нет данных ни от одного источника');
    } else {
        console.log(`⏺️ Без изменений (${source} mode)`);
    }
}

// ===== ЗАПУСК =====
client.on('ready', async () => {
    console.log(`✅ Залогинен как ${client.user.tag}`);
    
    console.log('\n📋 СПИСОК ТВОИХ СЕРВЕРОВ:');
    client.guilds.cache.forEach(guild => {
        console.log(`🔹 "${guild.name}" (ID: ${guild.id})`);
    });
    
    await loadState();
    await checkAll();
    
    setInterval(checkAll, 30 * 1000);
    
    console.log('👀 Бот запущен и следит за каналами');
});

client.login(process.env.USER_TOKEN);

