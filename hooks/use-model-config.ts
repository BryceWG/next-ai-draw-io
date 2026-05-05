"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getApiEndpoint } from "@/lib/base-path"
import type { FlattenedServerModel } from "@/lib/server-model-config"
import { STORAGE_KEYS } from "@/lib/storage"
import {
    createEmptyConfig,
    createModelConfig,
    createProviderConfig,
    type FlattenedModel,
    findModelById,
    flattenModels,
    type ModelConfig,
    type MultiModelConfig,
    type ProviderConfig,
    type ProviderName,
} from "@/lib/types/model-config"

export interface UseModelConfigReturn {
    config: MultiModelConfig
    isLoaded: boolean

    models: FlattenedModel[]
    selectedModel: FlattenedModel | undefined
    selectedModelId: string | undefined
    showUnvalidatedModels: boolean

    setSelectedModelId: (modelId: string | undefined) => void
    setShowUnvalidatedModels: (show: boolean) => void
    addProvider: (provider: ProviderName) => ProviderConfig
    updateProvider: (
        providerId: string,
        updates: Partial<ProviderConfig>,
    ) => void
    deleteProvider: (providerId: string) => void
    addModel: (providerId: string, modelId: string) => ModelConfig
    updateModel: (
        providerId: string,
        modelConfigId: string,
        updates: Partial<ModelConfig>,
    ) => void
    deleteModel: (providerId: string, modelConfigId: string) => void
    resetConfig: () => void
}

async function loadConfigFromServer(): Promise<MultiModelConfig> {
    try {
        const response = await fetch(getApiEndpoint("/api/model-config"))
        if (!response.ok) {
            console.warn(`Failed to load model config: HTTP ${response.status}`)
            return createEmptyConfig()
        }
        const data = await response.json()
        if (
            data?.config?.version === 1 &&
            Array.isArray(data.config.providers)
        ) {
            return data.config as MultiModelConfig
        }
    } catch (error) {
        console.error("Failed to load model config:", error)
    }
    return createEmptyConfig()
}

async function saveConfigToServer(config: MultiModelConfig): Promise<void> {
    try {
        const response = await fetch(getApiEndpoint("/api/model-config"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config }),
        })
        if (!response.ok) {
            const message = await response.text().catch(() => "")
            console.warn(
                `Failed to save model config: HTTP ${response.status}${
                    message ? ` ${message}` : ""
                }`,
            )
        }
    } catch (error) {
        console.error("Failed to save model config:", error)
    }
}

export function useModelConfig(): UseModelConfigReturn {
    const [config, setConfig] = useState<MultiModelConfig>(createEmptyConfig)
    const [isLoaded, setIsLoaded] = useState(false)
    const [serverModels, setServerModels] = useState<FlattenedServerModel[]>([])
    const [serverLoaded, setServerLoaded] = useState(false)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        let cancelled = false
        loadConfigFromServer().then((loaded) => {
            if (cancelled) return
            setConfig(loaded)
            setIsLoaded(true)
        })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return

        fetch(getApiEndpoint("/api/server-models"))
            .then((res) => {
                if (!res.ok) {
                    throw new Error(`Request failed with status ${res.status}`)
                }
                return res.json()
            })
            .then((data) => {
                const raw: FlattenedServerModel[] = data?.models || []
                setServerModels(raw)
                setServerLoaded(true)

                setConfig((prev) => {
                    if (!prev.selectedModelId && raw.length > 0) {
                        const defaultModel = raw.find((m) => m.isDefault)
                        return {
                            ...prev,
                            selectedModelId: defaultModel?.id || raw[0].id,
                        }
                    }
                    return prev
                })
            })
            .catch((error) => {
                console.error("Error while loading server models:", error)
                setServerLoaded(true)
            })
    }, [])

    useEffect(() => {
        if (!isLoaded || !serverLoaded) return
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(() => {
            saveConfigToServer(config)
            saveTimeoutRef.current = null
        }, 500)
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [config, isLoaded, serverLoaded])

    const userModels = flattenModels(config)
    const models: FlattenedModel[] = [
        ...serverModels.map((m) => ({
            id: m.id,
            modelId: m.modelId,
            provider: m.provider,
            providerLabel: `Server · ${m.providerLabel}`,
            apiKey: "",
            baseUrl: undefined,
            awsAccessKeyId: undefined,
            awsSecretAccessKey: undefined,
            awsRegion: undefined,
            awsSessionToken: undefined,
            vertexApiKey: undefined,
            validated: true,
            source: "server" as const,
            isDefault: m.isDefault,
            apiKeyEnv: m.apiKeyEnv,
            baseUrlEnv: m.baseUrlEnv,
        })),
        ...userModels,
    ]

    const selectedModel = config.selectedModelId
        ? models.find((m) => m.id === config.selectedModelId)
        : undefined

    const setSelectedModelId = useCallback((modelId: string | undefined) => {
        setConfig((prev) => ({
            ...prev,
            selectedModelId: modelId,
        }))
    }, [])

    const setShowUnvalidatedModels = useCallback((show: boolean) => {
        setConfig((prev) => ({
            ...prev,
            showUnvalidatedModels: show,
        }))
    }, [])

    const addProvider = useCallback(
        (provider: ProviderName): ProviderConfig => {
            const newProvider = createProviderConfig(provider)
            setConfig((prev) => ({
                ...prev,
                providers: [...prev.providers, newProvider],
            }))
            return newProvider
        },
        [],
    )

    const updateProvider = useCallback(
        (providerId: string, updates: Partial<ProviderConfig>) => {
            setConfig((prev) => ({
                ...prev,
                providers: prev.providers.map((p) =>
                    p.id === providerId ? { ...p, ...updates } : p,
                ),
            }))
        },
        [],
    )

    const deleteProvider = useCallback((providerId: string) => {
        setConfig((prev) => {
            const provider = prev.providers.find((p) => p.id === providerId)
            const modelIds = provider?.models.map((m) => m.id) || []
            const newSelectedId =
                prev.selectedModelId && modelIds.includes(prev.selectedModelId)
                    ? undefined
                    : prev.selectedModelId

            return {
                ...prev,
                providers: prev.providers.filter((p) => p.id !== providerId),
                selectedModelId: newSelectedId,
            }
        })
    }, [])

    const addModel = useCallback(
        (providerId: string, modelId: string): ModelConfig => {
            const newModel = createModelConfig(modelId)
            setConfig((prev) => ({
                ...prev,
                providers: prev.providers.map((p) =>
                    p.id === providerId
                        ? { ...p, models: [...p.models, newModel] }
                        : p,
                ),
            }))
            return newModel
        },
        [],
    )

    const updateModel = useCallback(
        (
            providerId: string,
            modelConfigId: string,
            updates: Partial<ModelConfig>,
        ) => {
            setConfig((prev) => ({
                ...prev,
                providers: prev.providers.map((p) =>
                    p.id === providerId
                        ? {
                              ...p,
                              models: p.models.map((m) =>
                                  m.id === modelConfigId
                                      ? { ...m, ...updates }
                                      : m,
                              ),
                          }
                        : p,
                ),
            }))
        },
        [],
    )

    const deleteModel = useCallback(
        (providerId: string, modelConfigId: string) => {
            setConfig((prev) => ({
                ...prev,
                providers: prev.providers.map((p) =>
                    p.id === providerId
                        ? {
                              ...p,
                              models: p.models.filter(
                                  (m) => m.id !== modelConfigId,
                              ),
                          }
                        : p,
                ),
                selectedModelId:
                    prev.selectedModelId === modelConfigId
                        ? undefined
                        : prev.selectedModelId,
            }))
        },
        [],
    )

    const resetConfig = useCallback(() => {
        setConfig(createEmptyConfig())
    }, [])

    return {
        config,
        isLoaded: isLoaded && serverLoaded,
        models,
        selectedModel,
        selectedModelId: config.selectedModelId,
        showUnvalidatedModels: config.showUnvalidatedModels ?? false,
        setSelectedModelId,
        setShowUnvalidatedModels,
        addProvider,
        updateProvider,
        deleteProvider,
        addModel,
        updateModel,
        deleteModel,
        resetConfig,
    }
}

export function getSelectedAIConfig(config: MultiModelConfig): {
    accessCode: string
    aiProvider: string
    aiBaseUrl: string
    aiApiKey: string
    aiModel: string
    awsAccessKeyId: string
    awsSecretAccessKey: string
    awsRegion: string
    awsSessionToken: string
    selectedModelId: string
    vertexApiKey: string
} {
    const empty = {
        accessCode: "",
        aiProvider: "",
        aiBaseUrl: "",
        aiApiKey: "",
        aiModel: "",
        awsAccessKeyId: "",
        awsSecretAccessKey: "",
        awsRegion: "",
        awsSessionToken: "",
        selectedModelId: "",
        vertexApiKey: "",
    }

    const accessCode =
        typeof window !== "undefined"
            ? localStorage.getItem(STORAGE_KEYS.accessCode) || ""
            : ""

    if (!config.selectedModelId) {
        return { ...empty, accessCode }
    }

    if (config.selectedModelId.startsWith("server:")) {
        const parts = config.selectedModelId.split(":")
        const nameSlug = parts[1] || ""
        const modelId = parts.slice(2).join(":")

        return {
            ...empty,
            accessCode,
            aiProvider: nameSlug,
            aiModel: modelId,
            selectedModelId: config.selectedModelId,
        }
    }

    const model = findModelById(config, config.selectedModelId)
    if (!model) {
        return { ...empty, accessCode }
    }

    return {
        accessCode,
        aiProvider: model.provider,
        aiBaseUrl: model.baseUrl || "",
        aiApiKey: model.apiKey,
        aiModel: model.modelId,
        awsAccessKeyId: model.awsAccessKeyId || "",
        awsSecretAccessKey: model.awsSecretAccessKey || "",
        awsRegion: model.awsRegion || "",
        awsSessionToken: model.awsSessionToken || "",
        selectedModelId: config.selectedModelId || "",
        vertexApiKey: model.vertexApiKey || "",
    }
}
