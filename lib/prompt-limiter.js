/** Magnific/Freepik nano-banana prompt field max length */
export const MAGNIFIC_MAX_PROMPT_LENGTH = 3000;

function stripDecorations(text) {
    return text
        .replace(/[╔╗╚╝═║┌┐└┘─│□☐✗✓⚠️•]/g, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function trimAtSentence(text, maxLength) {
    if (text.length <= maxLength) return text;

    let trimmed = text.slice(0, maxLength).trim();
    const lastPeriod = trimmed.lastIndexOf('.');
    if (lastPeriod > maxLength * 0.75) {
        trimmed = trimmed.slice(0, lastPeriod);
    }
    return trimmed;
}

/**
 * Build a compact, always-included size block for every configured piece.
 * @param {Array<{pieceName?: string, numericValue?: number, unit?: string, isValid?: boolean}>} sizeValidations
 */
export function buildCompactSizeBlock(sizeValidations = [], enforcedBlock = '') {
    if (enforcedBlock) return enforcedBlock;
    const validSizes = sizeValidations.filter((sv) => sv.isValid);
    if (validSizes.length === 0) return '';

    const summary = validSizes
        .map((sv) => sv.normalized?.display || `${sv.pieceName}: ${sv.numericValue} ${sv.unit}`)
        .join('; ');

    return `MANDATORY SCALE — render exactly: ${summary}. Do NOT enlarge jewelry.`;
}

/**
 * Fit a prompt within Magnific's 3000-character limit.
 * Sizes and user instructions are always preserved when provided.
 */
function extractExistingSizeBlock(text) {
    const match = text.match(/MANDATORY SIZES — render exactly:.*?(?=\. User instruction|$)/i)
        || text.match(/Sizes:.*?(?=\. [A-Z]|$)/i);
    return match ? match[0].trim() : '';
}

function extractExistingUserInstruction(text) {
    const match = text.match(/User instruction \(priority\):.*/i)
        || text.match(/User instruction \(highest priority\):.*/i);
    return match ? match[0].replace(/User instruction \([^)]+\):\s*/i, '').trim() : '';
}

export function fitPromptForMagnific(prompt, options = {}) {
    const maxLength = options.maxLength ?? MAGNIFIC_MAX_PROMPT_LENGTH;
    const sizeBlock = options.sizeBlock
        || buildCompactSizeBlock(options.sizeValidations)
        || extractExistingSizeBlock(prompt);
    const userInstruction = (options.userInstruction || extractExistingUserInstruction(prompt)).trim();

    if (!prompt) return prompt;
    if (prompt.length <= maxLength && !options.sizeBlock && !options.sizeValidations?.length && !options.userInstruction) {
        return prompt;
    }

    const footerParts = [];
    if (sizeBlock) footerParts.push(sizeBlock);
    if (userInstruction) footerParts.push(`User instruction (priority): ${userInstruction}`);
    const footer = footerParts.join('. ');

    if (!footer && prompt.length <= maxLength) return prompt;

    let body = stripDecorations(prompt);

    if (footer) {
        body = body
            .replace(/Exact sizes:.*?(?=\. [A-Z]|$)/gi, '')
            .replace(/Size requirements \(mandatory\):.*?(?=\. [A-Z]|$)/gi, '')
            .replace(/MANDATORY SIZES — render exactly:.*?(?=\. [A-Z]|$)/gi, '')
            .replace(/User instruction \(highest priority\):.*?(?=\. [A-Z]|$)/gi, '')
            .replace(/User instruction \(priority\):.*?(?=\. [A-Z]|$)/gi, '')
            .replace(/\.\s*\./g, '.')
            .trim();
    }

    if (!footer) {
        if (body.length <= maxLength) return body;
        console.warn(`Prompt compressed ${prompt.length} → ${maxLength} chars for Magnific API`);
        return trimAtSentence(body, maxLength);
    }

    const footerBudget = footer.length + 2;
    const bodyBudget = Math.max(maxLength - footerBudget, 500);

    if (body.length > bodyBudget) {
        body = trimAtSentence(body, bodyBudget);
    }

    let result = `${body}. ${footer}`.replace(/\.\s*\./g, '.').trim();

    if (result.length > maxLength) {
        const minFooterBudget = footer.length + 2;
        body = trimAtSentence(body, maxLength - minFooterBudget);
        result = `${body}. ${footer}`.replace(/\.\s*\./g, '.').trim();
    }

    if (result.length > maxLength) {
        result = `${result.slice(0, maxLength - footer.length - 2)}. ${footer}`;
    }

    if (prompt.length > result.length || body !== stripDecorations(prompt)) {
        console.warn(`Prompt fitted ${prompt.length} → ${result.length} chars (sizes preserved: ${!!sizeBlock})`);
    }

    return result.slice(0, maxLength);
}