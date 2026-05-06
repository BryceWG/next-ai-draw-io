import { describe, expect, it } from "vitest"
import {
    getSelectedAIConfig,
    resolveSelectedModelIdForServerModels,
} from "@/hooks/use-model-config"
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
        expect(selected.aiProvider).toBe("")
        expect(selected.aiModel).toBe("")
        expect(selected.selectedModelId).toBe("server:deepseek:deepseek-chat")
    })
})

describe("resolveSelectedModelIdForServerModels", () => {
    const models = [
        {
            id: "server:openai:gpt-4o",
            modelId: "gpt-4o",
            provider: "openai" as const,
            providerLabel: "OpenAI",
            isDefault: false,
        },
        {
            id: "server:deepseek:deepseek-chat",
            modelId: "deepseek-chat",
            provider: "deepseek" as const,
            providerLabel: "DeepSeek",
            isDefault: true,
        },
    ]

    it("selects the configured default when no model is selected", () => {
        expect(resolveSelectedModelIdForServerModels(undefined, models)).toBe(
            "server:deepseek:deepseek-chat",
        )
    })

    it("falls back when the selected server model was removed", () => {
        expect(
            resolveSelectedModelIdForServerModels(
                "server:old-provider:old-model",
                models,
            ),
        ).toBe("server:deepseek:deepseek-chat")
    })

    it("keeps user models unchanged", () => {
        expect(
            resolveSelectedModelIdForServerModels("user-model-id", models),
        ).toBe("user-model-id")
    })

    it("clears a removed server model when no server models remain", () => {
        expect(
            resolveSelectedModelIdForServerModels(
                "server:old-provider:old-model",
                [],
            ),
        ).toBeUndefined()
    })
})
