require('dotenv').config();

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
const MAX_CACHE_SIZE = 100;
const CHECK_INTERVAL = 30 * 1000;
const MEMORY_CLEAN_INTERVAL = 30 * 60 * 1000;

// Эмодзи
const EMOJIS = {
    'Carrot': '🥕', 'Corn': '🌽', 'Onion': '🧅', 'Strawberry': '🍓',
    'Mushroom': '🍄', 'Beetroot': '🟣', 'Tomato': '🍅', 'Apple': '🍎',
    'Rose': '🌹', 'Wheat': '🌾', 'Banana': '🍌', 'Plum': '🟣',
    'Potato': '🥔', 'Cabbage': '🥬', 'Cherry': '🍒',
    'Watering Can': '💧', 'Basic Sprinkler': '💦', 'Harvest Bell': '🔔',
    'Turbo Sprinkler': '⚡', 'Favorite Tool': '⭐', 'Super Sprinkler': '💎',
    'Fog': '🌫️', 'Rain': '☔', 'Sandstorm': '🏜️', 'Snow': '❄️',
    'Starfall': '🌠', 'Storm': '⛈️'
};

// Кэш и данные
let roleNameCache = new Map();
let stockData = {
    seeds: [], gear: [], weather: null,
    lastUpdate: null, messageId: null,
    source: 'official', downNotified: false
};

// ===== ЗАГРУЗКА/СОХРАНЕНИЕ =====
async function loadState() {
    try {
        const data = await fs.readFile('state.json', 'utf8');
        const saved = JSON.parse(data);
        stockData = { ...stockData, ...saved };
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

// ===== ПОИСК РОЛИ =====
async function findRoleName(roleId) {
    try {
        if (roleNameCache.size > MAX_CACHE_SIZE) {
            console.log('🧹 Чистим кэш ролей');
            roleNameCache.clear();
        }
        
        if (roleNameCache.has(roleId)) {
            return roleNameCache.get(roleId);
        }
        
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const role = await guild.roles.fetch(roleId);
                if (role) {
                    roleNameCache.set(roleId, role.name);
                    return role.name;
                }
            } catch (e) {}
        }
        
        roleNameCache.set(roleId, null);
        return null;
    } catch (error) {
        return null;
    }
}

// ===== ПАРСИНГ КОМПОНЕНТОВ =====
function extractTextFromComponents(components) {
    if (!components?.length) return '';
    let text = '';
    function extract(comp) {
        if (comp.content) text += comp.content + '\n';
        if (comp.components) comp.components.forEach(extract);
    }
    components.forEach(extract);
    return text;
}

// ===== ПАРСИНГ КАНАЛОВ =====
async function parseOfficialSeedChannel() {
    try {
        const channel = client.channels.cache.get(process.env.SEED_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        if (!msg?.components?.length) return null;
        
        const messageAge = Date.now() - msg.createdTimestamp;
        if (messageAge > 5 * 60 * 1000) return null;
        
        const text = extractTextFromComponents(msg.components);
        const items = [];
        
        for (const line of text.split('\n')) {
            const match = line.match(/<@&(\d+)>\s*\(x(\d+)\)/);
            if (match) {
                const name = await findRoleName(match[1]);
                if (name) items.push({ name, count: parseInt(match[2]), roleId: match[1] });
            }
        }
        
        return items.length ? items : null;
    } catch (error) {
        return null;
    }
}

async function parseOfficialGearChannel() {
    try {
        const channel = client.channels.cache.get(process.env.GEAR_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        if (!msg?.components?.length) return null;
        
        const messageAge = Date.now() - msg.createdTimestamp;
        if (messageAge > 5 * 60 * 1000) return null;
        
        const text = extractTextFromComponents(msg.components);
        const items = [];
        
        for (const line of text.split('\n')) {
            const match = line.match(/<@&(\d+)>\s*\(x(\d+)\)/);
            if (match) {
                const name = await findRoleName(match[1]);
                if (name) items.push({ name, count: parseInt(match[2]), roleId: match[1] });
            }
        }
        
        return items.length ? items : null;
    } catch (error) {
        return null;
    }
}

async function parseOfficialWeatherChannel() {
    try {
        const channel = client.channels.cache.get(process.env.WEATHER_CHANNEL_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        if (!msg?.components?.length) return null;
        
        const messageAge = Date.now() - msg.createdTimestamp;
        if (messageAge > 5 * 60 * 1000) return null;
        
        const text = extractTextFromComponents(msg.components);
        
        const weatherMatch = text.match(/now @?(\w+)/i);
        const startMatch = text.match(/start[:\s]+(\d{1,2}:\d{2})/i);
        const endMatch = text.match(/end[:\s]+(\d{1,2}:\d{2})/i);
        
        return weatherMatch ? {
            weather: weatherMatch[1],
            startTime: startMatch?.[1] || null,
            endTime: endMatch?.[1] || null
        } : null;
    } catch (error) {
        return null;
    }
}

async function parseBackupSeedChannel() {
    try {
        const channel = client.channels.cache.get(process.env.BACKUP_SEED_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        if (!msg?.embeds?.length) return null;
        
        const items = [];
        const desc = msg.embeds[0].description;
        if (desc) {
            for (const line of desc.split('\n')) {
                const match = line.match(/-?\s*([\w\s]+?)\s*x(\d+)/i);
                if (match) items.push({ name: match[1].trim(), count: parseInt(match[2]) });
            }
        }
        return items.length ? items : null;
    } catch (error) {
        return null;
    }
}

async function parseBackupGearChannel() {
    try {
        const channel = client.channels.cache.get(process.env.BACKUP_GEAR_ID);
        if (!channel) return null;
        
        const messages = await channel.messages.fetch({ limit: 1 });
        const msg = messages.first();
        if (!msg?.embeds?.length) return null;
        
        const items = [];
        const desc = msg.embeds[0].description;
        if (desc) {
            for (const line of desc.split('\n')) {
                const cleanLine = line.replace(/[•\s]/g, '').replace(/[^\w\s]/g, '').trim();
                const match = cleanLine.match(/([\w\s]+)\s*x(\d+)/i);
                if (match) items.push({ name: match[1].trim(), count: parseInt(match[2]) });
            }
        }
        return items.length ? items : null;
    } catch (error) {
        return null;
    }
}

// ===== ОТПРАВКА =====
async function sendToDiscord() {
    try {
        if (!stockData.seeds.length && !stockData.gear.length && !stockData.weather) return;
        
        const myGuild = client.guilds.cache.get(process.env.GUILD_ID);
        let pingText = '';
        
        if (stockData.source === 'official' && myGuild) {
            [...stockData.gear, ...stockData.seeds].forEach(item => {
                if (item.roleId) {
                    const role = myGuild.roles.cache.find(r => r.name === item.name);
                    if (role) pingText += `<@&${role.id}> `;
                }
            });
        }
        
        const fields = [];
        
        if (stockData.seeds.length) {
            fields.push({
                name: '🌾 SEEDS',
                value: stockData.seeds.map(i => `• ${i.name} ${EMOJIS[i.name] || ''} — ${i.count}`).join('\n'),
                inline: false
            });
        }
        
        if (stockData.gear.length) {
            fields.push({
                name: '⚙️ GEAR',
                value: stockData.gear.map(i => `• ${i.name} ${EMOJIS[i.name] || ''} — ${i.count}`).join('\n'),
                inline: false
            });
        }
        
        if (stockData.weather && stockData.source === 'official') {
            const w = stockData.weather;
            let timeLeft = '';
            if (w.endTime) {
                const now = new Date();
                const [h, m] = w.endTime.split(':').map(Number);
                const end = new Date(); end.setHours(h, m, 0);
                if (end < now) end.setDate(end.getDate() + 1);
                const mins = Math.round((end - now) / 60000);
                timeLeft = ` (${mins} min left)`;
            }
            fields.push({
                name: '☁️ WEATHER',
                value: `• ${w.weather} ${EMOJIS[w.weather] || '☁️'}\n• Started: ${w.startTime || '??'}\n• Ends: ${w.endTime || '??'}${timeLeft}`,
                inline: false
            });
        }
        
        let footerText = `Last update: ${new Date().toLocaleTimeString()} UTC`;
        if (stockData.source === 'backup') footerText += ' ⚠️ Backup mode';
        
        const message = {
            content: pingText.trim() || undefined,
            embeds: [{
                title: '🌱 GARDEN HORIZONS | STOCK',
                color: 0x00FF00,
                fields,
                footer: { text: footerText },
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
        
        if (stockData.messageId) {
            try {
                await axios.patch(`${process.env.TARGET_WEBHOOK_URL}/messages/${stockData.messageId}`, message);
                console.log(`✏️ Обновлено (${stockData.source})`);
                return;
            } catch (e) {
                if (e.response?.status !== 404) throw e;
                stockData.messageId = null;
            }
        }
        
        const response = await axios.post(process.env.TARGET_WEBHOOK_URL, message);
        stockData.messageId = response.data.id;
        await saveState();
        console.log(`📨 Создано (${stockData.source})`);
    } catch (error) {
        console.error('❌ Ошибка отправки:', error.message);
    }
}

// ===== ОСНОВНАЯ ПРОВЕРКА =====
async function checkAll() {
    try {
        console.log(`\n🕒 ${new Date().toLocaleTimeString()} - Проверка...`);
        
        let newSeeds = await parseOfficialSeedChannel();
        let newGear = await parseOfficialGearChannel();
        let newWeather = await parseOfficialWeatherChannel();
        let source = 'official';
        
        if (!newSeeds && !newGear) {
            console.log('⚠️ Официальный бот молчит, пробую backup...');
            newSeeds = await parseBackupSeedChannel();
            newGear = await parseBackupGearChannel();
            newWeather = null;
            source = 'backup';
        }
        
        let changed = false;
        
        if (JSON.stringify(newSeeds) !== JSON.stringify(stockData.seeds)) {
            stockData.seeds = newSeeds || [];
            changed = true;
        }
        if (JSON.stringify(newGear) !== JSON.stringify(stockData.gear)) {
            stockData.gear = newGear || [];
            changed = true;
        }
        if (JSON.stringify(newWeather) !== JSON.stringify(stockData.weather)) {
            stockData.weather = newWeather || null;
            changed = true;
        }
        
        if (changed && (newSeeds || newGear || newWeather)) {
            stockData.source = source;
            stockData.lastUpdate = new Date().toISOString();
            await saveState();
            await sendToDiscord();
        } else {
            console.log('⏺️ Без изменений');
        }
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    }
}

// ===== ЧИСТКА ПАМЯТИ =====
function cleanMemory() {
    try {
        console.log('🧹 Чистка памяти...');
        roleNameCache.clear();
        if (global.gc) global.gc();
    } catch (e) {}
}

// ===== ЗАПУСК =====
client.on('ready', async () => {
    console.log('🎯 Событие ready сработало!');
    console.log(`✅ Залогинен как ${client.user.tag}`);
    
    console.log('\n📋 Доступные сервера:');
    client.guilds.cache.forEach(g => console.log(`🔹 ${g.name} (${g.id})`));
    
    await loadState();
    await checkAll();
    
    setInterval(checkAll, CHECK_INTERVAL);
    setInterval(cleanMemory, MEMORY_CLEAN_INTERVAL);
    
    console.log('👀 Бот запущен');
});

client.login(process.env.USER_TOKEN).catch(error => {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА ВХОДА:');
    console.error(error);
    process.exit(1);
});

  









