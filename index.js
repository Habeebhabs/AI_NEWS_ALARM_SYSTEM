import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Logic from Server/telegramFetcher.js ---

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(process.env.TELEGRAM_SESSION || "");

const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

async function startTelegram() {
    try {
        console.log("Connecting to Telegram...");
        await client.connect();
        console.log("Telegram Client Connected!");

        // Optional: Check auth status
        if (!await client.checkAuthorization()) {
            console.warn("⚠️ Client not authorized! Please provide a valid session string in .env");
        }
    } catch (err) {
        console.error("Failed to connect to Telegram:", err);
    }
}

// API Endpoint
app.get('/api/messages', async (req, res) => {
    const channelName = req.query.channel;
    const limit = Number(req.query.limit) || 20;

    if (!channelName) {
        return res.status(400).json({ error: 'Missing channel parameter' });
    }

    try {
        // Ensure connection is active
        if (!client.connected) {
            await client.connect();
        }

        const result = await client.getMessages(channelName, { limit: limit });

        const messages = result.map(msg => ({
            id: msg.id,
            date: msg.date,
            message: msg.message,
            // Add other fields as needed for client compatibility
        })).filter(msg => msg.message); // Basic filtering

        res.json(messages);

    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ error: error.message || 'Failed to fetch messages' });
    }
});

// Start Server
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await startTelegram();
});
