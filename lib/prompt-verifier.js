/**
 * Prompt Verifier & Conflict Resolver
 * 
 * This module handles the CRITICAL logic of resolving conflicts between
 * templates and user-selected presets, ensuring user choices take priority.
 */

import { BACKGROUND_PRESETS, RELIGION_PRESETS, DRESS_CODE_PRESETS, MODEL_CONSISTENCY_OPTIONS, getPresetById } from './presets.js';
import { buildCompactSizeBlock, fitPromptForMagnific } from './prompt-limiter.js';
import { buildEnforcedSizeBlock, normalizeJewelrySize } from './size-normalizer.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFLICT RESOLUTION RULES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TEMPLATE CONFLICT MAP
 * Defines which template elements conflict with which presets
 */
const TEMPLATE_CONFLICTS = {
    'south-indian': {
        // When user selects Christian/Muslim/Other religion, we must modify the template
        religionConflicts: ['christian', 'muslim', 'other'],
        // Elements in the template that need modification
        conflictingElements: {
            modelPrompt: [
                { pattern: /South Indian woman/gi, replacement: 'Indian woman' },
                { pattern: /jasmine flowers \(gajra\)/gi, replacement: 'elegant hairstyle' },
                { pattern: /traditional temple-style hair/gi, replacement: 'elegant hairstyle' },
                { pattern: /standing in an ornate temple corridor/gi, replacement: 'in an elegant indoor setting' },
                { pattern: /with carved stone pillars/gi, replacement: '' },
            ],
            settingPrompt: [
                { pattern: /traditional South Indian temple/gi, replacement: 'elegant indoor setting' },
                { pattern: /golden oil lamps/gi, replacement: 'soft ambient lighting' },
                { pattern: /intricate gopuram architecture/gi, replacement: 'sophisticated interior design' },
                { pattern: /marigold flower decorations/gi, replacement: 'subtle floral accents' },
            ],
            lightingPrompt: [
                { pattern: /divine glow/gi, replacement: 'warm glow' },
                { pattern: /oil lamp reflections/gi, replacement: 'soft light reflections' },
            ]
        },
        // Replacement prompts based on religion
        religionReplacements: {
            'christian': {
                modelPrompt: 'A beautiful Indian Christian woman wearing elegant attire, with a graceful and modest appearance, subtle makeup, in a refined indoor setting',
                settingPrompt: 'elegant church interior or sophisticated Christian wedding venue with soft lighting, white floral arrangements, refined and peaceful atmosphere',
                lightingPrompt: 'soft natural lighting with warm gentle tones, serene and peaceful ambiance'
            },
            'muslim': {
                modelPrompt: 'A beautiful Indian Muslim woman wearing elegant modest attire, graceful and dignified appearance, in a refined indoor setting',
                settingPrompt: 'elegant indoor setting with Islamic architectural elements, soft lighting, peaceful and refined atmosphere',
                lightingPrompt: 'soft warm lighting with gentle shadows, serene and dignified ambiance'
            },
            'other': {
                modelPrompt: 'A beautiful Indian woman wearing elegant modern attire, sophisticated and graceful appearance, in a contemporary indoor setting',
                settingPrompt: 'modern elegant indoor setting with sophisticated design, clean lines, soft ambient lighting',
                lightingPrompt: 'modern professional lighting with clean warm tones, contemporary ambiance'
            }
        }
    },
    'north-indian': {
        religionConflicts: ['christian', 'muslim', 'other'],
        conflictingElements: {
            modelPrompt: [
                { pattern: /North Indian woman/gi, replacement: 'Indian woman' },
            ],
            settingPrompt: [
                { pattern: /Mughal palace interior/gi, replacement: 'elegant indoor setting' },
                { pattern: /marble jali screens/gi, replacement: 'elegant window treatments' },
            ]
        },
        religionReplacements: {
            'christian': {
                modelPrompt: 'A beautiful Indian Christian woman wearing elegant attire, graceful and sophisticated appearance',
                settingPrompt: 'elegant church hall or sophisticated Christian venue with soft lighting and white floral arrangements',
                lightingPrompt: 'soft natural lighting with warm gentle tones'
            },
            'muslim': {
                modelPrompt: 'A beautiful Indian Muslim woman wearing elegant modest attire, graceful and dignified appearance',
                settingPrompt: 'elegant indoor venue with Islamic architectural influences, soft dignified lighting',
                lightingPrompt: 'soft warm lighting with gentle shadows'
            },
            'other': {
                modelPrompt: 'A beautiful Indian woman wearing elegant modern attire, sophisticated appearance',
                settingPrompt: 'modern elegant indoor setting with sophisticated design',
                lightingPrompt: 'modern professional lighting'
            }
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFLICT RESOLUTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolves conflicts between template and user-selected presets
 * USER CHOICES ALWAYS TAKE PRIORITY
 */
export function resolveConflicts({
    template,
    templateId,
    backgroundPreset,
    religionPreset,
    dressCodePreset,
    customModelPhoto,
    consistencyMode,
    analysis
}) {
    const conflicts = [];
    const modifications = [];
    
    // Start with a copy of the template
    let resolvedTemplate = { ...template };
    
    // Get conflict rules for this template
    const conflictRules = TEMPLATE_CONFLICTS[templateId];
    
    // Check for religion conflicts
    if (conflictRules && religionPreset && conflictRules.religionConflicts.includes(religionPreset)) {
        conflicts.push({
            type: 'religion_template_mismatch',
            description: `Template "${template.name}" contains religious elements that conflict with "${religionPreset}" religion preset`,
            resolution: `Modified template to match ${religionPreset} aesthetic`
        });
        
        // Apply religion-specific replacements
        const replacements = conflictRules.religionReplacements[religionPreset];
        if (replacements) {
            resolvedTemplate.modelPrompt = replacements.modelPrompt;
            resolvedTemplate.settingPrompt = replacements.settingPrompt;
            resolvedTemplate.lightingPrompt = replacements.lightingPrompt;
            modifications.push(`Model description changed to match ${religionPreset} aesthetic`);
            modifications.push(`Setting changed from temple/palace to appropriate venue`);
            modifications.push(`Lighting adjusted for ${religionPreset} atmosphere`);
        }
    }
    
    // If dress code is specified, it overrides the template's outfit description
    if (dressCodePreset) {
        const dressPreset = getPresetById(DRESS_CODE_PRESETS, dressCodePreset);
        if (dressPreset && resolvedTemplate.modelPrompt) {
            // Remove clothing references from model prompt
            const clothingPatterns = [
                /wearing a rich Kanjivaram silk saree[^,]*/gi,
                /wearing an embroidered royal blue and gold lehenga[^,]*/gi,
                /wearing elegant black cocktail dress[^,]*/gi,
                /wearing a flowing champagne-colored silk gown[^,]*/gi,
            ];
            
            let modifiedModelPrompt = resolvedTemplate.modelPrompt;
            clothingPatterns.forEach(pattern => {
                modifiedModelPrompt = modifiedModelPrompt.replace(pattern, `wearing ${dressPreset.name}`);
            });
            
            if (modifiedModelPrompt !== resolvedTemplate.modelPrompt) {
                resolvedTemplate.modelPrompt = modifiedModelPrompt;
                modifications.push(`Outfit changed to: ${dressPreset.name}`);
            }
        }
    }
    
    // If background preset is specified, it completely overrides template setting
    if (backgroundPreset) {
        const bgPreset = getPresetById(BACKGROUND_PRESETS, backgroundPreset);
        if (bgPreset) {
            conflicts.push({
                type: 'background_override',
                description: `User-selected background "${bgPreset.name}" overrides template default`,
                resolution: `Background set to: ${bgPreset.name}`
            });
            modifications.push(`Background changed from "${template.settingPrompt?.substring(0, 50)}..." to "${bgPreset.name}"`);
        }
    }
    
    // If custom model photo is used, template model description is irrelevant
    if (customModelPhoto) {
        const consistencyOpt = getPresetById(MODEL_CONSISTENCY_OPTIONS, consistencyMode || 'exact');
        conflicts.push({
            type: 'custom_model_override',
            description: 'Custom model photo uploaded - template model description will be ignored',
            resolution: `Using uploaded photo with ${consistencyOpt?.name || 'Exact Match'} mode`
        });
        modifications.push('Template model replaced with uploaded custom model photo');
        
        // Use the custom-model template prompts
        resolvedTemplate.modelPrompt = 'Use the uploaded model reference photo exactly as-is — same person, same face, same skin tone, same body proportions, same hair style and color, same outfit, same background. The model and the entire scene must remain completely unchanged.';
        resolvedTemplate.settingPrompt = 'Keep the exact same background, setting, and environment from the uploaded model reference photo. No changes to the scene whatsoever.';
        resolvedTemplate.lightingPrompt = 'Preserve the exact same lighting conditions from the uploaded model reference photo.';
        resolvedTemplate.posePrompt = 'Keep the exact same pose, expression, and body position from the uploaded model reference photo.';
    }
    
    return {
        template: resolvedTemplate,
        backgroundPreset,
        religionPreset,
        dressCodePreset,
        conflicts,
        modifications,
        wasModified: conflicts.length > 0 || modifications.length > 0
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIZE VALIDATION & ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════

const JEWELRY_SIZE_GUIDE = {
    ring: {
        unit: 'cm',
        typicalRange: { min: 1.5, max: 2.5 },
        visualReference: {
            small: '1.6cm - Small finger, delicate band',
            medium: '1.8cm - Average adult finger',
            large: '2.1cm - Larger finger, statement piece'
        },
        bodyProportion: 'Ring diameter should be approximately 1/4 to 1/3 of finger width',
        strictEnforcement: true
    },
    earrings: {
        unit: 'cm',
        typicalRange: { min: 0.5, max: 10 },
        visualReference: {
            small: '1-2cm - Stud or small drop',
            medium: '3-5cm - Standard drop earrings',
            large: '6-8cm - Statement chandelier',
            extraLarge: '10cm+ - Dramatic shoulder dusters'
        },
        bodyProportion: 'Earring length should be proportionate to face length (typically 1/4 to 1/2 of face height)',
        strictEnforcement: true
    },
    necklace: {
        unit: 'cm',
        typicalRange: { min: 35, max: 90 },
        visualReference: {
            choker: '35-40cm - Sits at base of throat',
            princess: '45-50cm - Sits at collarbone',
            matinee: '55-60cm - Sits at bust line',
            opera: '70-90cm - Sits below bust or doubled'
        },
        bodyProportion: 'Necklace length determines pendant position on chest',
        strictEnforcement: true
    },
    bracelet: {
        unit: 'cm',
        typicalRange: { min: 15, max: 22 },
        visualReference: {
            small: '15-16cm - Small wrist',
            medium: '17-18cm - Average wrist',
            large: '19-21cm - Large wrist'
        },
        bodyProportion: 'Should fit wrist with 1-2cm of movement',
        strictEnforcement: true
    },
    bangle: {
        unit: 'India size',
        typicalRange: { min: 2.0, max: 2.10 },
        visualReference: {
            small: '2.2-2.4 - Small hand',
            medium: '2.6-2.8 - Average hand',
            large: '2.10+ - Large hand'
        },
        bodyProportion: 'Inner diameter must allow hand to pass through but not fall off',
        strictEnforcement: true
    },
    'maang tikka': {
        unit: 'cm',
        typicalRange: { min: 8, max: 18 },
        visualReference: {
            small: '8-10cm - Forehead to hairline',
            medium: '12-14cm - Standard length',
            large: '15-18cm - Dramatic long tikka'
        },
        bodyProportion: 'Length from hairline to end of pendant, proportionate to face length',
        strictEnforcement: true
    },
    nath: {
        unit: 'cm',
        typicalRange: { min: 1.5, max: 4 },
        visualReference: {
            small: '1.5-2cm - Small nose ring',
            medium: '2.5-3cm - Standard nath',
            large: '3.5-4cm - Large statement nath'
        },
        bodyProportion: 'Ring diameter proportionate to nose width, typically 1.5x nostril width',
        strictEnforcement: true
    },
    anklet: {
        unit: 'cm',
        typicalRange: { min: 20, max: 30 },
        visualReference: {
            small: '21-23cm - Small ankle',
            medium: '24-26cm - Average ankle',
            large: '27-29cm - Large ankle'
        },
        bodyProportion: 'Should sit above the ankle bone with slight movement',
        strictEnforcement: true
    },
    pendant: {
        unit: 'cm',
        typicalRange: { min: 1, max: 8 },
        visualReference: {
            small: '1-2cm - Delicate pendant',
            medium: '3-4cm - Standard size',
            large: '5-6cm - Statement pendant',
            extraLarge: '7-8cm - Dramatic showpiece'
        },
        bodyProportion: 'Height of pendant only, proportionate to chest area and chain',
        strictEnforcement: true
    }
};

function identifyJewelryType(piece) {
    const typeStr = (piece?.type || '').toLowerCase();
    const descStr = (piece?.description || '').toLowerCase();
    
    // Sort keys by length (longest first) to avoid partial matches
    // e.g., "earrings" should match before "ring" because "earrings".includes("ring") is true
    const sortedTypes = Object.keys(JEWELRY_SIZE_GUIDE).sort((a, b) => b.length - a.length);
    
    for (const type of sortedTypes) {
        // Check for exact match or whole word match to avoid "earrings" matching "ring"
        const typePattern = new RegExp(`\\b${type}\\b`, 'i');
        if (typePattern.test(typeStr) || typePattern.test(descStr)) {
            return type;
        }
    }
    
    // Fallback: check for simple includes if whole word didn't match
    for (const type of sortedTypes) {
        if (typeStr.includes(type) || descStr.includes(type)) {
            return type;
        }
    }
    
    return 'unknown';
}

function validateSizeValue(value, unit, jewelryType) {
    const numValue = parseFloat(value);
    const guide = JEWELRY_SIZE_GUIDE[jewelryType];
    const normalized = normalizeJewelrySize(jewelryType, value, unit);

    const result = {
        isValid: normalized.isValid,
        numericValue: numValue,
        unit,
        jewelryType,
        normalized,
        warnings: [],
        guide,
    };

    if (!result.isValid) {
        result.warnings.push('Invalid size value - must be a positive number in a valid range');
        return result;
    }

    if (guide && jewelryType !== 'ring') {
        const { min, max } = guide.typicalRange;
        const checkValue = normalized.lengthCm ?? numValue;
        if (checkValue < min * 0.5) {
            result.warnings.push(`Size seems very small for ${jewelryType} (typical: ${min}-${max} ${guide.unit})`);
        } else if (checkValue > max * 1.5) {
            result.warnings.push(`Size seems very large for ${jewelryType} (typical: ${min}-${max} ${guide.unit})`);
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDING WITH STRICT ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function buildStrictSizePrompt(sizeValidations) {
    const validSizes = (sizeValidations || []).filter((sv) => sv.isValid);
    if (validSizes.length === 0) {
        return { sizeBlock: '', sizeConstraints: '', compactSizeBlock: '', scaleHints: [] };
    }

    const enforced = buildEnforcedSizeBlock(validSizes);
    const sizeSummary = validSizes
        .map((sv) => sv.normalized?.display || `${sv.pieceName}: ${sv.numericValue} ${sv.unit}`)
        .join('; ');

    return {
        sizeBlock: enforced.details,
        sizeConstraints: `Exact scale: ${sizeSummary}. `,
        compactSizeBlock: enforced.compact,
        scaleHints: enforced.hints,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN VERIFICATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export function verifyAndBuildPrompt({
    analysis,
    template,
    imageCount,
    extraPrompt,
    presetOptions,
    sessionMemory = '',
}) {
    const warnings = [];
    const errors = [];
    const sizeValidation = [];
    
    const sizes = presetOptions.sizes || {};
    const pieces = analysis?.pieces || [];
    const hasPieces = pieces.length > 0;
    
    // Validate sizes
    if (hasPieces) {
        pieces.forEach((piece, index) => {
            const sizeData = sizes?.[index];
            if (sizeData?.value) {
                const jewelryType = identifyJewelryType(piece);
                const validation = validateSizeValue(sizeData.value, sizeData.unit, jewelryType);
                
                sizeValidation.push({
                    index,
                    pieceName: piece.type || piece.description || `Piece ${index + 1}`,
                    ...validation,
                    displaySize: `${sizeData.value} ${sizeData.unit}`
                });
                
                if (validation.warnings.length > 0) {
                    warnings.push(...validation.warnings.map(w => `Size for ${piece.type || 'piece'}: ${w}`));
                }
            } else {
                warnings.push(`No size specified for ${piece.type || `piece ${index + 1}`}`);
            }
        });
    } else {
        const sizeData = sizes?.[0] || Object.values(sizes || {})[0];
        if (sizeData?.value) {
            const jewelryType = identifyJewelryType({ type: analysis?.type, description: analysis?.description });
            const validation = validateSizeValue(sizeData.value, sizeData.unit, jewelryType);
            
            sizeValidation.push({
                index: 0,
                pieceName: analysis?.type || 'Jewelry',
                ...validation,
                displaySize: `${sizeData.value} ${sizeData.unit}`
            });
        } else {
            warnings.push('No size specified - AI will estimate scale');
        }
    }
    
    // Check for critical conflicts
    if (presetOptions.religionPreset && presetOptions.backgroundPreset) {
        const bgPreset = getPresetById(BACKGROUND_PRESETS, presetOptions.backgroundPreset);
        const religionPreset = getPresetById(RELIGION_PRESETS, presetOptions.religionPreset);
        
        // Check for obvious mismatches
        if (presetOptions.religionPreset === 'christian') {
            if (presetOptions.backgroundPreset?.includes('temple') || 
                presetOptions.backgroundPreset?.includes('marble-courtyard')) {
                warnings.push('Background may not match Christian aesthetic - consider a different background');
            }
        }
    }
    
    // Build the prompt with strict size enforcement
    const { sizeBlock, sizeConstraints, compactSizeBlock, scaleHints } = buildStrictSizePrompt(sizeValidation);

    if (sizeValidation.filter((sv) => sv.isValid).length === 0) {
        errors.push('Size is required — enter jewelry dimensions so the AI renders correct scale on the model');
    }

    const promptParts = [];

    if (compactSizeBlock) {
        promptParts.push(compactSizeBlock);
    }
    if (sizeBlock) {
        promptParts.push(sizeBlock);
    }
    if (sessionMemory) {
        promptParts.push(sessionMemory);
    }

    promptParts.push(
        'Ultra-photorealistic jewelry advertisement photograph, 8K, Hasselblad macro lens, tack-sharp jewelry focus. Jewelry scale must match reference photo and user sizes exactly — never oversized on model'
    );

    if (presetOptions.hasCustomModelPhoto) {
        const consistencyOpt = getPresetById(MODEL_CONSISTENCY_OPTIONS, presetOptions.consistencyMode || 'exact');
        if (consistencyOpt) promptParts.push(consistencyOpt.promptSnippet);
    }

    if (presetOptions.religionPreset) {
        const religionOpt = getPresetById(RELIGION_PRESETS, presetOptions.religionPreset);
        if (religionOpt) promptParts.push(`Culture: ${religionOpt.promptSnippet}`);
    }

    if (template.modelPrompt) promptParts.push(`Model: ${template.modelPrompt}`);

    if (presetOptions.dressCodePreset) {
        const dressOpt = getPresetById(DRESS_CODE_PRESETS, presetOptions.dressCodePreset);
        if (dressOpt) promptParts.push(`Outfit: ${dressOpt.promptSnippet}`);
    }

    const jewelryDesc = (analysis?.description || 'elegant jewelry piece').slice(0, 400);
    const material = analysis?.material || 'precious metal';
    const stones = analysis?.stones?.length ? analysis.stones.join(', ') : '';
    const finish = analysis?.finish || '';
    const style = analysis?.style || '';
    const multiRef = imageCount > 1 ? `(${imageCount} reference photos)` : '';

    if (hasPieces || imageCount > 1) {
        const piecesList = pieces.map((p) => p.type || p.description).join(', ') || 'jewelry pieces';
        promptParts.push(
            `Model wears all referenced jewelry ${multiRef}: ${piecesList}. ${jewelryDesc}. ` +
            `${sizeConstraints}` +
            `${material}${style ? ` ${style}` : ''} jewelry${stones ? ` with ${stones}` : ''}${finish ? `, ${finish} finish` : ''}, ` +
            'match reference photo scale exactly on model body'
        );
    } else {
        promptParts.push(
            `Model wears the exact ${analysis?.type || 'jewelry'} from the reference ${multiRef}. ${jewelryDesc}. ` +
            `${sizeConstraints}` +
            `${material}${style ? ` ${style}` : ''} piece${stones ? ` with ${stones}` : ''}${finish ? `, ${finish} finish` : ''}, ` +
            'jewelry scale proportionate to model — match reference, never enlarged'
        );
    }

    promptParts.push(
        'Wear ONLY the referenced jewelry. No extra earrings, necklaces, rings, or accessories unless specified'
    );

    if (presetOptions.backgroundPreset) {
        const bgOpt = getPresetById(BACKGROUND_PRESETS, presetOptions.backgroundPreset);
        if (bgOpt) promptParts.push(`Background: ${bgOpt.promptSnippet}`);
    } else if (template.settingPrompt) {
        promptParts.push(`Setting: ${template.settingPrompt}`);
    }

    if (template.lightingPrompt) promptParts.push(`Lighting: ${template.lightingPrompt}`);
    if (template.posePrompt) promptParts.push(`Pose: ${template.posePrompt}`);

    promptParts.push('Shallow depth of field, magazine-quality color grading, accurate metal and gemstone reflections');

    if (extraPrompt?.trim()) {
        promptParts.push(`User instruction (highest priority): ${extraPrompt.trim()}`);
    }

    const rawPrompt = promptParts.join('. ');
    const prompt = fitPromptForMagnific(rawPrompt, {
        sizeBlock: compactSizeBlock,
        sizeValidations: sizeValidation,
        userInstruction: extraPrompt?.trim() || '',
    });

    if (prompt.length < rawPrompt.length) {
        console.log(`Prompt fitted for Magnific: ${rawPrompt.length} → ${prompt.length} chars`);
    }

    const configuredSizes = sizeValidation.filter((sv) => sv.isValid);
    if (configuredSizes.length > 0) {
        const missingInPrompt = configuredSizes.filter(
            (sv) => !prompt.includes(`${sv.numericValue}`) || !prompt.toLowerCase().includes(sv.pieceName.toLowerCase())
        );
        if (missingInPrompt.length > 0) {
            console.warn('Some sizes may be missing from fitted prompt:', missingInPrompt.map((s) => s.pieceName).join(', '));
        }
    }

    return {
        isValid: errors.length === 0,
        warnings,
        errors,
        sizeValidation,
        prompt,
        promptLength: prompt.length,
        configuredSizes: configuredSizes.map((sv) => ({
            piece: sv.pieceName,
            size: sv.normalized?.display || `${sv.numericValue} ${sv.unit}`,
        })),
        scaleHints,
    };
}
