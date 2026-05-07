// @vitest-environment node
import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createEmptySession } from "@/lib/session-storage"
import {
    countSessionsForUser,
    deleteOwnedSession,
    deleteTeamDataForUser,
    getModelConfigForUser,
    getSessionById,
    hasModelConfigForUser,
    listSessionMetadataForUser,
    saveModelConfigForUser,
    saveSessionForUser,
} from "@/lib/team-data-store"
import {
    createEmptyConfig,
    createModelConfig,
    createProviderConfig,
    flattenModels,
} from "@/lib/types/model-config"

const ORIGINAL_TEAM_DATA_DIR = process.env.TEAM_DATA_DIR
let tmpDir: string

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "drawio-team-data-"))
    process.env.TEAM_DATA_DIR = tmpDir
})

afterEach(async () => {
    process.env.TEAM_DATA_DIR = ORIGINAL_TEAM_DATA_DIR
    await fs.rm(tmpDir, { recursive: true, force: true })
})

describe("team session store", () => {
    it("lists only sessions owned by the current user", async () => {
        const aliceSession = {
            ...createEmptySession(),
            id: "session-alice",
            title: "Alice session",
        }
        const bobSession = {
            ...createEmptySession(),
            id: "session-bob",
            title: "Bob session",
        }

        await saveSessionForUser(aliceSession, "alice")
        await saveSessionForUser(bobSession, "bob")

        const aliceSessions = await listSessionMetadataForUser("alice")
        expect(aliceSessions.map((session) => session.id)).toEqual([
            "session-alice",
        ])
    })

    it("allows direct lookup by session id", async () => {
        const session = {
            ...createEmptySession(),
            id: "shared-link-session",
            title: "Shared",
        }
        await saveSessionForUser(session, "alice")

        await expect(
            getSessionById("shared-link-session"),
        ).resolves.toMatchObject({
            id: "shared-link-session",
            title: "Shared",
        })
    })

    it("restricts deletion to the owner", async () => {
        const session = {
            ...createEmptySession(),
            id: "owned-session",
        }
        await saveSessionForUser(session, "alice")

        await expect(deleteOwnedSession("owned-session", "bob")).resolves.toBe(
            "forbidden",
        )
        await expect(
            deleteOwnedSession("owned-session", "alice"),
        ).resolves.toBe("deleted")
    })

    it("counts and deletes data for a removed team user", async () => {
        await saveSessionForUser(
            {
                ...createEmptySession(),
                id: "alice-session",
            },
            "alice",
        )
        await saveSessionForUser(
            {
                ...createEmptySession(),
                id: "bob-session",
            },
            "bob",
        )
        const config = createEmptyConfig()
        config.providers = [createProviderConfig("openai")]
        await saveModelConfigForUser("alice", config)

        await expect(countSessionsForUser("alice")).resolves.toBe(1)
        await expect(hasModelConfigForUser("alice")).resolves.toBe(true)

        await deleteTeamDataForUser("alice")

        await expect(countSessionsForUser("alice")).resolves.toBe(0)
        await expect(hasModelConfigForUser("alice")).resolves.toBe(false)
        await expect(getSessionById("alice-session")).resolves.toBeNull()
        await expect(getSessionById("bob-session")).resolves.toMatchObject({
            id: "bob-session",
        })
    })
})

describe("team model config store", () => {
    it("stores model config per user", async () => {
        const aliceConfig = createEmptyConfig()
        const aliceProvider = createProviderConfig("openai")
        aliceProvider.apiKey = "alice-key"
        aliceConfig.providers = [aliceProvider]

        await saveModelConfigForUser("alice", aliceConfig)

        const loadedAlice = await getModelConfigForUser("alice")
        const loadedBob = await getModelConfigForUser("bob")

        expect(loadedAlice.providers[0].apiKey).toBe("alice-key")
        expect(loadedBob.providers).toEqual([])
    })

    it("preserves model-level vision settings in cloud storage", async () => {
        const config = createEmptyConfig()
        const provider = createProviderConfig("deepseek")
        const model = createModelConfig("deepseek-vl-custom")
        model.visionEnabled = true
        provider.models = [model]
        config.providers = [provider]

        await saveModelConfigForUser("alice", config)

        const loaded = await getModelConfigForUser("alice")
        expect(loaded.providers[0].models[0].visionEnabled).toBe(true)
    })

    it("includes model-level vision settings when flattening models", () => {
        const config = createEmptyConfig()
        const provider = createProviderConfig("deepseek")
        const model = createModelConfig("deepseek-vl-custom")
        model.visionEnabled = true
        provider.models = [model]
        config.providers = [provider]

        const flattened = flattenModels(config)

        expect(flattened[0].visionEnabled).toBe(true)
    })
})
