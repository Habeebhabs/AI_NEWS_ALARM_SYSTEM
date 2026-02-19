import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";

console.log("Loading interactive example...");

const apiId = Number(await input.text("Enter your Telegram API ID: "));
const apiHash = await input.text("Enter your Telegram API Hash: ");

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
});

await client.start({
    phoneNumber: async () => await input.text("Please enter your number: "),
    password: async () => await input.text("Please enter your password: "),
    phoneCode: async () => await input.text("Please enter the code you received: "),
    onError: (err) => console.log(err),
});

console.log("You should now be connected.");
console.log("Save this string to your .env file as TELEGRAM_SESSION:");
console.log(client.session.save()); // This prints the string session
await client.sendMessage("me", { message: "Hello! This is a test message from your AI News Alarm System." });
