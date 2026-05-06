/**
 * Shared model capability helpers.
 * Keep this file free of provider SDK imports so it is safe for client code.
 */

/**
 * Check if a model supports image/vision input.
 * Some models silently drop image parts without error (AI SDK warning only).
 */
export function supportsImageInput(modelId: string): boolean {
    const lowerModelId = modelId.toLowerCase()

    // Helper to check if model has vision capability indicator
    const hasVisionIndicator =
        lowerModelId.includes("vision") || lowerModelId.includes("vl")

    // Models that DON'T support image/vision input (unless vision variant)
    // Kimi K2 doesn't support images, but K2.5 does
    // Only block kimi-k2 specifically, not other Kimi models
    if (
        (lowerModelId.includes("kimi-k2") ||
            lowerModelId.includes("kimi_k2")) &&
        !hasVisionIndicator &&
        !lowerModelId.includes("2.5") &&
        !lowerModelId.includes("k2.5")
    ) {
        return false
    }

    // Moonshot text models (moonshot-v1 series are text-only)
    if (lowerModelId.includes("moonshot-v1") && !hasVisionIndicator) {
        return false
    }

    // MiniMax text models (MiniMax-M2.x series are text-only)
    if (lowerModelId.includes("minimax") && !hasVisionIndicator) {
        return false
    }

    // DeepSeek text models (not vision variants)
    if (lowerModelId.includes("deepseek") && !hasVisionIndicator) {
        return false
    }

    // Qwen text models (not vision variants like qwen-vl)
    // Qwen3.5 series (qwen3.5, qwen3.5-plus, qwen3.5-flash) natively support image input
    // QvQ (Qwen Visual QA) models are vision models — exclude them even when prefixed with "qwen/"
    if (
        lowerModelId.includes("qwen") &&
        !hasVisionIndicator &&
        !lowerModelId.includes("qwen3.5") &&
        !lowerModelId.includes("qvq")
    ) {
        return false
    }

    // GLM text models (not vision variants)
    // GLM vision models: glm-4v, glm-4v-9b, glm-4.1v-9b-thinking
    if (lowerModelId.includes("glm") && !hasVisionIndicator) {
        if (!/[\d.]v/.test(lowerModelId)) {
            return false
        }
    }

    // Default: assume model supports images
    return true
}

export function isImageInputAllowed(
    modelId: string,
    manualVisionEnabled?: boolean,
): boolean {
    return manualVisionEnabled ?? supportsImageInput(modelId)
}
