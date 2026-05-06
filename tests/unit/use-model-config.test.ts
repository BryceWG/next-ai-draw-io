import { describe, expect, it } from "vitest"
import { getSelectedAIConfig } from "@/hooks/use-model-config"
import {
    createEmptyConfig,
    createModelConfig,
    createProviderConfig,
} from "@/lib/types/model-config"

describe("getSelectedAIConfig", () => {
    it("includes the selected model vision override for user models", () => {
        const config = createEmptyConfig()
        const provider = createProviderConfig("deepseek")
        const model = createModelConfig("deepseek-chat")
        model.visionEnabled = true
        provider.models = [model]
        config.providers = [provider]
        config.selectedModelId = model.id

        const selected = getSelectedAIConfig(config)

        expect(selected.aiVisionEnabled).toBe("true")
    })

    it("does not include a vision override for server models", () => {
        const config = createEmptyConfig()
        config.selectedModelId = "server:deepseek:deepseek-chat"

        const selected = getSelectedAIConfig(config)

        expect(selected.aiVisionEnabled).toBe("")
    })
})
