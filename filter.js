import crypto from 'crypto';

const KEYWORDS = ["attack", "strike", "missile", "airstrike", "bombardment", "launched", "military operation", "drone attack", "rocket attack"];
const IRAN_KEYWORDS = ["iran", "islamic republic", "tehran", "irgc", "khamenei", "supreme leader", "pezeshkian"];
const USA_KEYWORDS = ["usa", "us", "u.s.", "united states", "america", "washington", "pentagon", "white house", "president", "trump", "pete hegseth", "israel"];

export function hashArticle(article) {
    return crypto
        .createHash("sha256")
        .update(article.title + article.id)
        .digest("hex");
}

export function isRelevant(article) {
    const text = (article.title + " " + article.summary).toLowerCase();

    const hasAction = KEYWORDS.some(k => text.includes(k));
    if (!hasAction) return false;

    // Must mention Iran OR USA (or both)
    const mentionsIran = IRAN_KEYWORDS.some(k => text.includes(k));
    const mentionsUSA = USA_KEYWORDS.some(k => text.includes(k));

    if (!mentionsIran && !mentionsUSA) return false;

    return true;
}
