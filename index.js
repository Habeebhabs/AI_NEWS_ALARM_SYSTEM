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
const activeAlerts = new Map(); // id -> { articles, retryCount, timer }

/**
 * Retries sending an alert every 2 minutes for a max of 3 times
 * unless acknowledged by the user.
 */
function scheduleRetry(alertId) {
    const alertData = activeAlerts.get(alertId);
    if (!alertData) return;

    if (alertData.retryCount >= 3) {
        console.log(`[Limit] Max retries reached for alert ${alertId}. Stopping.`);
        activeAlerts.delete(alertId);
        return;
    }

    alertData.timer = setTimeout(async () => {
        // Double check if still active
        const currentData = activeAlerts.get(alertId);
        if (!currentData) return;

        console.log(`[Retry ${currentData.retryCount + 1}/3] Resending alert ${alertId}...`);
        await sendAlert(currentData.articles);

        currentData.retryCount++;
        scheduleRetry(alertId);
    }, 2 * 60 * 1000); // 2 minute interval
}

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
        let batch = [];// to revert

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
            // const idHash = hashArticle(article); // to revert
            // if (seenHashes.has(idHash)) continue;// to revert

            // 3. Relevance Check
            // if (!isRelevant(article)) {// to revert
            //     // Mark as seen so we don't re-check irrelevant ones
            //     seenHashes.add(idHash);
            //     continue;
            // }

            // It's relevant and new -> Add to batch
            batch.push(article);
            // seenHashes.add(idHash);// to revert
        }
        batch = batch[0];// to revert
        if (batch.length === 0) {
            console.log("No new relevant messages.");
            return;
        }

        console.log(`Found ${batch.length} new relevant articles. Analyzing with AI...${JSON.stringify(batch, null, 2)}`);

        // 4. AI Analysis
        // const results = await classifyArticles(batch);// to revert
        console.log(`AI Analysis Results: ${JSON.stringify(results, null, 2)}`);
        // 5. Confirmed Threats
        // const confirmed = results.filter(res => res.confirmed && res.confidence >= 80);// to revert
        const confirmed = batch;// to revert
        if (confirmed.length > 0) {
            console.log(`🚨 ALERT: Found ${confirmed.length} CONFIRMED threats!`);

            // Map back to article data for the notification
            const articlesToSend = confirmed.map(alert => {
                return batch.find(b => b.id === alert.id);
            }).filter(Boolean);

            // 6. Send Notification
            await sendAlert(articlesToSend);

            // 7. Initialize Retry Logic
            const alertId = articlesToSend[0].id.toString();
            if (!activeAlerts.has(alertId)) {
                activeAlerts.set(alertId, {
                    articles: articlesToSend,
                    retryCount: 0,
                    timer: null
                });
                console.log(`[Orchestration] Started retry cycle for alert ${alertId}`);
                scheduleRetry(alertId);
            }
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

// Acknowledge endpoint to stop retries
app.post('/acknowledge', (req, res) => {
    const { id } = req.body;
    console.log(`[Ack] Received acknowledgment request for ID: ${id}`);

    if (!id) {
        return res.status(400).json({ error: "Missing alert ID" });
    }

    const alertId = id.toString();
    if (activeAlerts.has(alertId)) {
        const data = activeAlerts.get(alertId);
        if (data.timer) clearTimeout(data.timer);
        activeAlerts.delete(alertId);
        console.log(`✅ [Ack] Alert ${alertId} acknowledged. All retries stopped.`);
        res.json({ success: true, message: `Alert ${alertId} acknowledged. Retries stopped.` });
    } else {
        console.log(`⚠️ [Ack] Alert ${alertId} not found in active list (likely already acknowledged or expired).`);
        res.json({ success: false, message: "Alert not found or already acknowledged." });
    }
});

// Debug endpoint to see active retries
app.get('/pending', (req, res) => {
    const pending = Array.from(activeAlerts.keys()).map(id => ({
        id: id,
        retriesDone: activeAlerts.get(id).retryCount
    }));
    res.json({ count: pending.length, pending });
});

startServer();
