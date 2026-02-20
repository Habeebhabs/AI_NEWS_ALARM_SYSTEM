import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import { sendAlert } from './fcm.js';
import { classifyArticles } from './gemini.js';
import { isRelevant, hashArticle } from './filter.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(process.env.TELEGRAM_SESSION || "");

const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
});

const channelMap = {
    1: 'Middle_East_Spectator',
    2: 'DefenderDome'
}
let CHANNEL_NAME = '';

// const POLLING_INTERVAL = 60 * 1000; // 60 seconds
const seenHashes = new Set();

async function startServer() {
    console.log("Loading interactive example...");
    await client.start({
        phoneNumber: async () => await input.text("Please enter your number: "),
        password: async () => await input.text("Please enter your password: "),
        phoneCode: async () => await input.text("Please enter the code you received: "),
        onError: (err) => console.log(err),
    });
    console.log("You should now be connected.");
    client.session.save(); // Save this string to avoid logging in again

    // Start Polling Loop
    // setInterval(runPollingCycle, POLLING_INTERVAL);
    // Run immediately on start
    runPollingCycle(1);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

async function runPollingCycle(channelId) {
    console.log(`[${new Date().toLocaleTimeString()}] Polling Telegram...`);
    try {
        CHANNEL_NAME = channelMap[channelId || 1];

        console.log(`Polling ${CHANNEL_NAME}`);

        const messages = await client.getMessages(CHANNEL_NAME, { limit: 20 });
        const batch = [];

        for (const msg of messages) {
            if (!msg.message) continue;

            // 1. Time Check (12 hours)
            const publishedAt = new Date(msg.date * 1000);
            const timeDiff = Date.now() - publishedAt.getTime();
            if (timeDiff > 12 * 60 * 60 * 1000) continue;

            const article = {
                id: msg.id,
                publisher: `Telegram: ${CHANNEL_NAME}`,
                title: msg.message.substring(0, 50) + "..." || "No Title",
                summary: msg.message || "",
                link: `https://t.me/${CHANNEL_NAME}/${msg.id}`,
                publishedAt: publishedAt.toISOString()
            };

            // 2. Dedup Check
            const idHash = hashArticle(article);
            if (seenHashes.has(idHash)) continue;

            // 3. Relevance Check
            if (!isRelevant(article)) {
                // Mark as seen so we don't re-check irrelevant ones
                seenHashes.add(idHash);
                continue;
            }

            // It's relevant and new -> Add to batch
            batch.push(article);
            seenHashes.add(idHash);
        }

        if (batch.length === 0) {
            console.log("No new relevant messages.");
            return;
        }

        console.log(`Found ${batch.length} new relevant articles. Analyzing with AI...${JSON.stringify(batch)}`);

        // 4. AI Analysis
        const results = await classifyArticles(batch);
        console.log(`AI Analysis Results: ${JSON.stringify(results)}`);
        // 5. Confirmed Threats
        const confirmed = results.filter(res => res.confirmed && res.confidence >= 80);

        if (confirmed.length > 0) {
            console.log(`🚨 ALERT: Found ${confirmed.length} CONFIRMED threats!`);

            // Map back to article data for the notification
            const articlesToSend = confirmed.map(alert => {
                return batch.find(b => b.id === alert.id);
            }).filter(Boolean);

            // 6. Send Notification
            await sendAlert(articlesToSend);
        } else {
            console.log("Analysis complete. No confirmed threats.");
        }

    } catch (error) {
        console.error("Polling Error:", error);
    }
}

// Simple health check endpoint for Render
app.get('/', async (req, res) => {
    // Log source if present (e.g., 'client')
    const source = req.query.source;
    const channelId = req.query.channelId;
    if (source) {
        console.log(`Triggered by source: ${source}  - channelId: ${channelId}`);
    }

    // Trigger the logic manually (Async, don't wait for it to finish)
    runPollingCycle(channelId);

    res.send('AI News Alarm Server Triggered');
});

startServer();
