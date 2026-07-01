import { identifyJewelryType, normalizeJewelrySize } from './size-normalizer.js';

const PIECE_PLACEMENT = {
    ring: { wear: 'on finger', frame: 'hand and ring clearly visible', pose: 'elegant hand pose showcasing the ring' },
    earrings: { wear: 'on both ears', frame: 'ears and face visible', pose: 'face angle showing earrings' },
    necklace: { wear: 'around neck on chest', frame: 'neckline and chest visible', pose: 'posture highlighting necklace' },
    chain: { wear: 'around neck', frame: 'neck and upper chest visible', pose: 'posture showing chain length' },
    bracelet: { wear: 'on wrist', frame: 'wrist and hand visible', pose: 'wrist pose showing bracelet' },
    bangle: { wear: 'on wrist', frame: 'wrist visible', pose: 'arm position showing bangle' },
    'maang tikka': { wear: 'on forehead', frame: 'forehead and face visible', pose: 'face forward showing maang tikka' },
    nath: { wear: 'on nose', frame: 'face profile or 3/4 showing nath', pose: 'face angle showing nose ring' },
    anklet: { wear: 'on ankle', frame: 'ankle and foot visible', pose: 'seated or standing pose showing anklet' },
    pendant: { wear: 'on chain at chest', frame: 'chest area visible', pose: 'posture highlighting pendant' },
};

function getPlacement(type) {
    const key = (type || '').toLowerCase();
    for (const [k, v] of Object.entries(PIECE_PLACEMENT)) {
        if (key.includes(k)) return v;
    }
    return { wear: 'worn appropriately', frame: 'jewelry clearly visible', pose: 'natural pose showcasing jewelry' };
}

/** Resolve which jewelry pieces to focus on from analysis */
export function getFocusPieces(analysis) {
    const pieces = analysis?.pieces || [];
    if (pieces.length > 0) {
        return pieces.map((p, i) => ({
            index: i,
            type: (p.type || 'jewelry').toLowerCase(),
            name: p.type || p.description || `Piece ${i + 1}`,
            description: p.description || '',
            estimatedSize: p.estimatedSize || p.estimated_size || '',
            sizeHint: p.sizeHint || '',
            sizeUnit: p.sizeUnit || 'cm',
        }));
    }
    const type = (analysis?.type || 'jewelry').toLowerCase();
    return [{
        index: 0,
        type,
        name: analysis?.type || 'jewelry',
        description: analysis?.description || '',
        estimatedSize: analysis?.estimatedSize || analysis?.estimated_size || '',
        sizeHint: '',
        sizeUnit: 'cm',
    }];
}

function buildScaleForPiece(piece, userSize, jewelryType) {
    if (userSize?.value) {
        const normalized = normalizeJewelrySize(jewelryType, userSize.value, userSize.unit || 'cm');
        if (normalized.isValid) {
            return {
                source: 'user',
                display: normalized.display,
                hint: normalized.scaleHint,
            };
        }
    }

    if (piece.estimatedSize) {
        return {
            source: 'ai_estimate',
            display: piece.estimatedSize,
            hint: `Scale from reference image analysis: ${piece.name} approximately ${piece.estimatedSize}. Match reference photo proportions exactly on model — do not enlarge.`,
        };
    }

    return {
        source: 'reference',
        display: 'match reference image scale',
        hint: `${piece.name}: infer exact scale from reference photo. Jewelry must be proportionate to model body — never oversized.`,
    };
}

/**
 * Build adaptive focus + scale prompt based on detected jewelry pieces.
 */
export function buildAdaptiveJewelryPrompt(analysis, sizes = {}, sizeValidation = []) {
    const focusPieces = getFocusPieces(analysis);
    const pieceCount = focusPieces.length;
    const pieceNames = focusPieces.map((p) => p.name).join(', ');

    const scaleEntries = focusPieces.map((piece) => {
        const jewelryType = identifyJewelryType(piece);
        const userSize = sizes?.[piece.index];
        const validated = sizeValidation.find((sv) => sv.index === piece.index);
        const scale = validated?.normalized?.isValid
            ? { source: 'user', display: validated.normalized.display, hint: validated.normalized.scaleHint }
            : buildScaleForPiece(piece, userSize, jewelryType);
        const placement = getPlacement(piece.type);
        return { ...piece, jewelryType, scale, placement };
    });

    const parts = [];

    if (pieceCount === 1) {
        const p = scaleEntries[0];
        parts.push(
            `FOCUS JEWELRY: Show ONLY the ${p.name} from the reference image. ` +
            `The model must wear ${p.name} ${p.placement.wear}. ${p.placement.frame}. ` +
            `CRITICAL: Do NOT add any other jewelry — bare neck, bare ears, bare wrists unless this piece is worn there. ` +
            `The ${p.name} is the sole hero of the image.`
        );
    } else {
        parts.push(
            `FOCUS JEWELRY SET: Model must wear ALL ${pieceCount} referenced pieces together: ${pieceNames}. ` +
            `Every piece must be visible and styled harmoniously in one shot. ` +
            `Do NOT add jewelry that is not in the reference. Do NOT omit any referenced piece.`
        );
        scaleEntries.forEach((p) => {
            parts.push(`${p.name}: worn ${p.placement.wear}, ${p.placement.frame}`);
        });
    }

    const scaleHints = scaleEntries.map((p) => p.scale.hint).filter(Boolean);
    if (scaleHints.length > 0) {
        parts.push(`SCALE: ${scaleHints.join(' ')}`);
    }

    const compactScale = scaleEntries
        .map((p) => `${p.name}: ${p.scale.display}`)
        .join('; ');

    return {
        focusBlock: parts.join('. '),
        compactScaleBlock: compactScale
            ? `JEWELRY SCALE (${pieceNames}): ${compactScale}. Match reference — never enlarge.`
            : '',
        scaleHints: scaleEntries.map((p) => ({ piece: p.name, hint: p.scale.hint })),
        focusPieces: scaleEntries,
        pieceNames,
        pieceCount,
    };
}