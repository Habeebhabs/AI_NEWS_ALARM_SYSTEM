import 'dotenv/config';
import { sendAlert } from './fcm.js';

(async () => {
    console.log("🚀 Sending Test Alert...");

    const fakeArticles = [
        {
            id: 123456789,
            publisher: 'Telegram: Middle_East_Spectator',
            title: 'TEST ALERT: This is a test notification',
            summary: 'This is a test summary from the test script to verify FCM integration.',
            link: 'https://t.me/Middle_East_Spectator/12345',
            publishedAt: new Date().toISOString()
        },
        {
            id: 987654321,
            publisher: 'Telegram: DefenderDome',
            title: 'TEST ALERT 2: Another source confirmation',
            summary: 'Second source confirming the test event.',
            link: 'https://t.me/DefenderDome/67890',
            publishedAt: new Date().toISOString()
        }
    ];

    try {
        const response = await sendAlert(fakeArticles);
        console.log("✅ Test Alert Sent Successfully!");
        console.log("Response:", response);
    } catch (error) {
        console.error("❌ Test Alert Failed:", error);
    }
})();
