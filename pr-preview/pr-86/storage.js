import { array, boolean, number, object, optional, safeParse, string, } from "valibot";
const wordSchema = array(object({
    word: string(),
    x: number(),
    y: number(),
    angle: optional(number(), 0),
    checked: optional(boolean(), false),
}));
function toPrecision(number, precision) {
    const factor = 10 ** Math.floor(precision);
    return Math.round(number * factor) / factor;
}
export function getSavedWords(key) {
    const savedWordsString = window.localStorage.getItem(key);
    let parsedWords;
    try {
        parsedWords = JSON.parse(savedWordsString ?? "[]");
    }
    catch (e) {
        console.error("Failed to parse saved words from localStorage:", e);
        return [];
    }
    const validationResult = safeParse(wordSchema, parsedWords);
    if (!validationResult.success) {
        console.error("Saved words in localStorage have invalid format:", validationResult.issues);
        return [];
    }
    return validationResult.output;
}
export function saveWords(key, words) {
    const wordArray = Array.from(words, ({ word, x, y, angle, checked }) => {
        return {
            word,
            x: toPrecision(x, 1),
            y: toPrecision(y, 1),
            angle: angle == null || angle === 0 ? undefined : toPrecision(angle, 4),
            checked: checked == null || checked === false ? undefined : checked,
        };
    });
    window.localStorage.setItem(key, JSON.stringify(wordArray));
}
