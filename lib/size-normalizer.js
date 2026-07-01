/**
 * Normalize jewelry sizes to physical dimensions and build AI scale hints.
 */

const RING_INDIA_SIZE_RANGE = { min: 8, max: 30 };

/** Approximate inner diameter in cm from Indian ring size */
export function indiaRingSizeToDiameterCm(indiaSize) {
    const size = parseFloat(indiaSize);
    if (isNaN(size)) return null;
    return Math.round((1.22 + size * 0.034) * 100) / 100;
}

/** US ring size to inner diameter cm */
export function usRingSizeToDiameterCm(usSize) {
    const size = parseFloat(usSize);
    if (isNaN(size)) return null;
    return Math.round((1.05 + size * 0.098) * 100) / 100;
}

export function normalizeJewelrySize(jewelryType, value, unit) {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue) || numericValue <= 0) {
        return { isValid: false, display: '', diameterCm: null, lengthCm: null, scaleHint: '' };
    }

    const type = (jewelryType || '').toLowerCase();

    if (type === 'ring') {
        if (unit === 'India size' || unit === 'India Size') {
            const diameterCm = indiaRingSizeToDiameterCm(numericValue);
            return {
                isValid: numericValue >= RING_INDIA_SIZE_RANGE.min && numericValue <= RING_INDIA_SIZE_RANGE.max,
                display: `India size ${numericValue} (inner diameter ${diameterCm} cm)`,
                diameterCm,
                lengthCm: null,
                scaleHint: buildRingScaleHint(diameterCm, `India size ${numericValue}`),
            };
        }
        if (unit === 'US size' || unit === 'US Size') {
            const diameterCm = usRingSizeToDiameterCm(numericValue);
            return {
                isValid: diameterCm > 0,
                display: `US size ${numericValue} (inner diameter ${diameterCm} cm)`,
                diameterCm,
                lengthCm: null,
                scaleHint: buildRingScaleHint(diameterCm, `US size ${numericValue}`),
            };
        }
        const diameterCm = unit === 'mm' ? numericValue / 10 : numericValue;
        return {
            isValid: diameterCm >= 1.2 && diameterCm <= 3.5,
            display: `${diameterCm} cm inner diameter`,
            diameterCm,
            lengthCm: null,
            scaleHint: buildRingScaleHint(diameterCm, `${diameterCm} cm`),
        };
    }

    const lengthCm = unit === 'mm' ? numericValue / 10 : numericValue;
    return {
        isValid: lengthCm > 0,
        display: `${lengthCm} ${unit === 'mm' ? 'cm' : unit}`,
        diameterCm: null,
        lengthCm,
        scaleHint: buildGenericScaleHint(type, lengthCm, unit),
    };
}

function buildRingScaleHint(diameterCm, label) {
    return (
        `RING SCALE CRITICAL: ${label} = ${diameterCm} cm inner diameter. ` +
        `The ring must appear SMALL on the finger — band under 4mm wide, stone setting proportionate to finger only. ` +
        `Never render as oversized cocktail ring. In portrait shots the ring is a subtle hand detail, not a large focal object. ` +
        `Match the exact physical scale from the reference photo.`
    );
}

function buildGenericScaleHint(jewelryType, lengthCm, unit) {
    const hints = {
        earrings: `Earring length exactly ${lengthCm} cm from earlobe — proportionate to face, not oversized.`,
        necklace: `Necklace chain length exactly ${lengthCm} cm — sits correctly on chest relative to model.`,
        bracelet: `Bracelet length exactly ${lengthCm} cm — fits wrist naturally without gaps.`,
        bangle: `Bangle size ${lengthCm} ${unit} — proportionate to wrist, not oversized.`,
        pendant: `Pendant height exactly ${lengthCm} cm — small relative to chest area.`,
    };
    return hints[jewelryType] || `Jewelry dimension exactly ${lengthCm} cm — proportionate to model body, never enlarged.`;
}

export function buildEnforcedSizeBlock(sizeValidations = []) {
    const valid = sizeValidations.filter((sv) => sv.isValid && sv.normalized?.isValid !== false);
    if (valid.length === 0) return { compact: '', details: '', hints: [] };

    const normalizedEntries = valid.map((sv) => {
        const normalized = sv.normalized || normalizeJewelrySize(sv.jewelryType, sv.numericValue, sv.unit);
        return { ...sv, normalized };
    });

    const compact = normalizedEntries
        .map((sv) => `${sv.pieceName}: ${sv.normalized.display}`)
        .join('; ');

    const details = normalizedEntries.map((sv) => sv.normalized.scaleHint).join(' ');

    return {
        compact: `MANDATORY SCALE — render exactly: ${compact}. Do NOT enlarge jewelry.`,
        details,
        hints: normalizedEntries.map((sv) => ({
            piece: sv.pieceName,
            hint: sv.normalized.scaleHint,
        })),
    };
}

export function hasConfiguredSizes(analysis, sizes = {}) {
    const pieces = analysis?.pieces || [];
    if (pieces.length > 0) {
        return pieces.every((_, index) => {
            const value = sizes?.[index]?.value;
            return value !== undefined && String(value).trim() !== '';
        });
    }
    const value = sizes?.[0]?.value;
    return value !== undefined && String(value).trim() !== '';
}