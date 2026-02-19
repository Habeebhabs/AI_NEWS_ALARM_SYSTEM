import admin from "firebase-admin";
import { readFileSync } from "fs";
// Initialize Firebase Admin
try {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Production: Read from Env Var
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // Development: Read from File
        serviceAccount = JSON.parse(readFileSync(new URL("./serviceAccountKey.json", import.meta.url)));
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Initialized");
} catch (error) {
    console.error("❌ Firebase Initialization Error:", error.message);
}

export async function sendAlert(articles) {
    const topic = "news_alerts_v2";

    const message = {
        android: {
            notification: {
                channelId: "news_alerts_v2",
                sound: "alarm"
            }
        },
        notification: {
            title: "🚨 URGENT: Military Attack Confirmed",
            body: `${articles.length} sources confirmed a military event. Check App immediately.`
        },
        topic: topic,
        data: {
            count: articles.length.toString(),
            sources: JSON.stringify(articles.map(a => a.publisher)),
            articleId: articles[0].id.toString()
        }
    };

    try {
        const response = await admin.messaging().send(message);
        console.log("✅ FCM Notification Sent:", response);
        return response;
    } catch (error) {
        console.error("❌ FCM Send Error:", error.message);
        // Don't throw, just log
    }
}
