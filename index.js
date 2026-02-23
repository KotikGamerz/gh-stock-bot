require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');
const { fetch } = require('undici');
const fs = require('fs').promises;

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🌱 Garden Horizons Bot is running!');
});

app.listen(port, () => {
    console.log(`✅ Web server running on port ${port}`);
});

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
    messageId: null
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

// ===== ПАРСИНГ КАНАЛА С СЕМЕНАМИ =====
async function parseSeedChannel() {
    try {
        const channel = client.channels.cache.get(process.env.SEED_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.components.length) return null;
        
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
        console.error('Ошибка парсинга семян:', error.message);
        return null;
    }
}

// ===== ПАРСИНГ КАНАЛА С ГИРОМ =====
async function parseGearChannel() {
    try {
        const channel = client.channels.cache.get(process.env.GEAR_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.components.length) return null;
        
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
        console.error('Ошибка парсинга гира:', error.message);
        return null;
    }
}

// ===== ПАРСИНГ КАНАЛА С ПОГОДОЙ =====
async function parseWeatherChannel() {
    try {
        const channel = client.channels.cache.get(process.env.WEATHER_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        
        if (!msg || !msg.components.length) return null;
        
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

// ===== ОТПРАВКА В DISCORD =====
async function sendToDiscord() {
    if (!stockData.seeds.length && !stockData.gear.length && !stockData.weather) {
        console.log('⏳ Нет данных для отправки');
        return;
    }
    
    // ТВОЙ СЕРВЕР ПО ID
    const myGuild = client.guilds.cache.get('1253393202053124281');
    
    let pingText = '';
    
    if (!myGuild) {
        console.log('❌ Сервер не найден! Использую текст без пингов');
        for (const item of stockData.gear) pingText += `@${item.name} `;
        for (const item of stockData.seeds) pingText += `@${item.name} `;
    } else {
        console.log(`✅ Сервер найден: ${myGuild.name}`);
        // Гир
        for (const item of stockData.gear) {
            const myRole = myGuild.roles.cache.find(r => r.name === item.name);
            if (myRole) {
                pingText += `<@&${myRole.id}> `;
                console.log(`✅ Найдена роль: ${item.name}`);
            } else {
                pingText += `@${item.name} `;
                console.log(`❌ Нет роли: ${item.name}`);
            }
        }
        // Семена
        for (const item of stockData.seeds) {
            const myRole = myGuild.roles.cache.find(r => r.name === item.name);
            if (myRole) {
                pingText += `<@&${myRole.id}> `;
                console.log(`✅ Найдена роль: ${item.name}`);
            } else {
                pingText += `@${item.name} `;
                console.log(`❌ Нет роли: ${item.name}`);
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
    
    // Погода
    if (stockData.weather) {
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
    
    const message = {
        content: pingText.trim(),
        embeds: [{
            title: '🌱 GARDEN HORIZONS | STOCK',
            color: 0x00FF00,
            fields: fields,
            footer: {
                text: `Last update: ${new Date().toLocaleTimeString()} UTC`
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    try {
        if (stockData.messageId) {
            await axios.patch(
                `${process.env.TARGET_WEBHOOK_URL}/messages/${stockData.messageId}`,
                message
            );
            console.log('✏️ Сообщение обновлено');
        } else {
            const response = await axios.post(process.env.TARGET_WEBHOOK_URL, message);
            stockData.messageId = response.data.id;
            await saveState();
            console.log('📨 Новое сообщение создано');
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
    
    const [newSeeds, newGear, newWeather] = await Promise.all([
        parseSeedChannel(),
        parseGearChannel(),
        parseWeatherChannel()
    ]);
    
    let changed = false;
    
    if (newSeeds) {
        if (JSON.stringify(newSeeds) !== JSON.stringify(stockData.seeds)) {
            console.log('🔄 Семена изменились');
            stockData.seeds = newSeeds;
            changed = true;
        }
    }
    
    if (newGear) {
        if (JSON.stringify(newGear) !== JSON.stringify(stockData.gear)) {
            console.log('🔄 Гир изменился');
            stockData.gear = newGear;
            changed = true;
        }
    }
    
    if (newWeather) {
        if (JSON.stringify(newWeather) !== JSON.stringify(stockData.weather)) {
            console.log('🔄 Погода изменилась');
            stockData.weather = newWeather;
            changed = true;
        }
    }
    
    if (changed) {
        stockData.lastUpdate = new Date().toISOString();
        await saveState();
        await sendToDiscord();
    } else {
        console.log('⏺️ Без изменений');
    }
}

// ===== ЗАПУСК =====
client.on('ready', async () => {
    console.log(`✅ Залогинен как ${client.user.tag}`);
    
    await loadState();
    await checkAll();
    
    setInterval(checkAll, 30 * 1000);
    
    console.log('👀 Бот запущен и следит за каналами');
});


client.login(process.env.USER_TOKEN);
