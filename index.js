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

// ===== КОНСТАНТЫ =====
const MAX_CACHE_SIZE = 100; // Максимальный размер кэша ролей
const CHECK_INTERVAL = 30 * 1000; // 30 секунд
const MEMORY_CLEAN_INTERVAL = 30 * 60 * 1000; // 30 минут

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
let roleNameCache = new Map();

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
        const saved = JSON.parse(data);
        stockData = {
            seeds: saved.seeds || [],
            gear: saved.gear || [],
            weather: saved.weather || null,
            lastUpdate: saved.lastUpdate || null,
            messageId: saved.messageId || null,
            source: saved.source || 'official',
            downNotified: saved.downNotified || false
        };
        console.log('📂 Загружено состояние');
    } catch (error) {
        console.log('🆕 Новое состояние');
    }
}

async function saveState() {
    try {
        await fs.writeFile('state.json', JSON.stringify(stockData, null, 2));
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error.message);
    }
}

// ===== ПОИСК РОЛИ С ЗАЩИТОЙ ОТ УТЕЧЕК =====
async function findRoleName(roleId) {
    try {
        // Защита от утечки памяти
        if (roleNameCache.size > MAX_CACHE_SIZE) {
            console.log('🧹 Кэш ролей слишком большой, очищаем...');
            roleNameCache.clear();
        }
        
        // Проверяем кэш
        if (roleNameCache.has(roleId)) {
            return roleNameCache.get(roleId);
        }
        
        console.log(`🔍 Ищу роль ${roleId}...`);
        
        // Перебираем все серверы
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const role = await guild.roles.fetch(roleId);
                if (role) {
                    console.log(`✅ Нашёл: ${role.name} на сервере ${guild.name}`);
                    roleNameCache.set(roleId, role.name);
                    return role.name;
                }
            } catch (error) {
                // Игнорируем ошибки
            }
        }
        
        console.log(`❌ Роль ${roleId} не найдена`);
        roleNameCache.set(roleId, null);
        return null;
    } catch (error) {
        console.error('❌ Ошибка в findRoleName:', error.message);
        return null;
    }
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
        const channel = client.channels.cache.get(process.env.BACKUP_SEED_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.embeds || !msg.embeds.length) return null;
        
        const embed = msg.embeds[0];
        const items = [];
        
        if (embed.description) {
            const lines = embed.description.split('\n');
            
            for (const line of lines) {
                const match = line.match(/-?\s*([\w\s]+?)\s*x(\d+)/i);
                if (match) {
                    items.push({
                        name: match[1].trim(),
                        count: parseInt(match[2])
                    });
                }
            }
        }
        
        return items.length ? items : null;
    } catch (error) {
        console.error('Ошибка парсинга backup семян:', error.message);
        return null;
    }
}

// ===== ПАРСИНГ BACKUP БОТА (ГИР) =====
async function parseBackupGearChannel() {
    try {
        const channel = client.channels.cache.get(process.env.BACKUP_GEAR_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.embeds || !msg.embeds.length) return null;
        
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
        
        return items.length ? items : null;
    } catch (error) {
        console.error('Ошибка парсинга backup гира:', error.message);
        return null;
    }
}

// ===== ОТПРАВКА В DISCORD =====
async function sendToDiscord() {
    try {
        if (!stockData.seeds.length && !stockData.gear.length && !stockData.weather) {
            console.log('⏳ Нет данных для отправки');
            return;
        }
        
        const myGuild = client.guilds.cache.get(process.env.GUILD_ID);
        
        let pingText = '';
        
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
        
        let footerText = `Last update: ${new Date().toLocaleTimeString()} UTC`;
        if (stockData.source === 'backup') {
            footerText += ' ⚠️ Backup mode';
        }
        
        const message = {
            content: pingText.trim() || undefined,
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
        
        if (stockData.source === 'backup') {
            message.embeds[0].fields.push({
                name: '⚠️ Backup Mode',
                value: 'Bot is running in backup mode. Some information (weather, role pings) may be missing.',
                inline: false
            });
        }
        
        // Проверяем существует ли сообщение
        let messageExists = true;
        if (stockData.messageId) {
            try {
                await axios.get(`${process.env.TARGET_WEBHOOK_URL}/messages/${stockData.messageId}`);
            } catch (error) {
                if (error.response?.status === 404) {
                    messageExists = false;
                    stockData.messageId = null;
                    await saveState();
                }
            }
        }
        
        if (stockData.messageId && messageExists) {
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
    }
}

// ===== ОСНОВНАЯ ПРОВЕРКА =====
async function checkAll() {
    try {
        console.log(`\n🕒 ${new Date().toLocaleTimeString()} - Проверка...`);
        
        const [newSeeds, newGear, newWeather] = await Promise.all([
            parseOfficialSeedChannel(),
            parseOfficialGearChannel(),
            parseOfficialWeatherChannel()
        ]);
        
        let source = 'official';
        let hasData = false;
        
        if (!newSeeds && !newGear) {
            console.log('⚠️ Официальный бот молчит, пробую backup...');
            const [backupSeeds, backupGear] = await Promise.all([
                parseBackupSeedChannel(),
                parseBackupGearChannel()
            ]);
            
            if (backupSeeds || backupGear) {
                stockData.seeds = backupSeeds || [];
                stockData.gear = backupGear || [];
                stockData.weather = null;
                source = 'backup';
                hasData = true;
            }
        } else {
            stockData.seeds = newSeeds || [];
            stockData.gear = newGear || [];
            stockData.weather = newWeather || null;
            source = 'official';
            hasData = true;
        }
        
        if (hasData) {
            stockData.source = source;
            stockData.lastUpdate = new Date().toISOString();
            await saveState();
            await sendToDiscord();
        } else {
            console.log('⚠️ Нет данных ни от одного источника');
        }
    } catch (error) {
        console.error('❌ Ошибка в checkAll:', error.message);
    }
}

// ===== АВТОМАТИЧЕСКАЯ ЧИСТКА ПАМЯТИ =====
function cleanMemory() {
    try {
        console.log('🧹 Плановая чистка памяти...');
        
        // Чистим кэш ролей
        const oldSize = roleNameCache.size;
        roleNameCache.clear();
        console.log(`✅ Кэш ролей очищен (было ${oldSize} записей)`);
        
        // Пытаемся вызвать сборщик мусора
        if (global.gc) {
            global.gc();
            console.log('✅ Сборщик мусора вызван');
        }
        
        // Очищаем неиспользуемые переменные
        if (global.gc) {
            global.gc();
            global.gc();
        }
        
        console.log('📊 Память:', process.memoryUsage());
    } catch (error) {
        console.error('❌ Ошибка при чистке памяти:', error.message);
    }
}

// ===== ЗАПУСК =====
client.on('ready', async () => {
    console.log('🔍 Пытаюсь залогиниться...');
    console.log(`✅ Залогинен как ${client.user.tag}`);
    
    console.log('\n📋 Доступные сервера:');
    client.guilds.cache.forEach(guild => {
        console.log(`🔹 ${guild.name} (${guild.id})`);
    });
    
    await loadState();
    await checkAll();
    
    setInterval(checkAll, CHECK_INTERVAL);
    setInterval(cleanMemory, MEMORY_CLEAN_INTERVAL);
    
    console.log('👀 Бот запущен и следит за каналами');
});

client.login(process.env.USER_TOKEN).catch(error => {
    console.error('❌ ОШИБКА ВХОДА:', error.message);
    console.error('🔥 Токен не работает или аккаунт заблокирован!');
    process.exit(1);
});

  




