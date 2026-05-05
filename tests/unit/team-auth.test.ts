// @vitest-environment node
import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
    hashPassword,
    isTeamRegistrationEnabled,
    loadTeamUsers,
    registerTeamUser,
    verifyPasswordHash,
} from "@/lib/team-auth"

const ORIGINAL_ENV = { ...process.env }
let tmpDir: string

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "drawio-team-auth-"))
    process.env.AUTH_SECRET = "test-secret"
    process.env.TEAM_USERS_FILE = path.join(tmpDir, "users.json")
})

afterEach(async () => {
    process.env.AUTH_SECRET = ORIGINAL_ENV.AUTH_SECRET
    process.env.TEAM_USERS_FILE = ORIGINAL_ENV.TEAM_USERS_FILE
    process.env.ENABLE_TEAM_REGISTRATION = ORIGINAL_ENV.ENABLE_TEAM_REGISTRATION
    await fs.rm(tmpDir, { recursive: true, force: true })
})

describe("team auth password hashes", () => {
    it("verifies the original password", async () => {
        const hash = await hashPassword("correct horse battery staple")

        await expect(
            verifyPasswordHash("correct horse battery staple", hash),
        ).resolves.toBe(true)
    })

    it("rejects the wrong password", async () => {
        const hash = await hashPassword("correct horse battery staple")

        await expect(verifyPasswordHash("wrong password", hash)).resolves.toBe(
            false,
        )
    })

    it("rejects unsupported hash formats", async () => {
        await expect(verifyPasswordHash("password", "plaintext")).resolves.toBe(
            false,
        )
    })
})

describe("team registration", () => {
    it("is disabled unless explicitly enabled", () => {
        process.env.ENABLE_TEAM_REGISTRATION = "false"
        expect(isTeamRegistrationEnabled()).toBe(false)

        process.env.ENABLE_TEAM_REGISTRATION = "true"
        expect(isTeamRegistrationEnabled()).toBe(true)
    })

    it("creates a user in the team users file", async () => {
        const user = await registerTeamUser({
            userId: "alice",
            name: "Alice",
            password: "password123",
        })

        expect(user.id).toBe("alice")
        expect(user.name).toBe("Alice")

        const users = await loadTeamUsers()
        expect(users).toHaveLength(1)
        expect(users[0].id).toBe("alice")
        await expect(
            verifyPasswordHash("password123", users[0].passwordHash),
        ).resolves.toBe(true)
    })

    it("rejects duplicate user IDs", async () => {
        await registerTeamUser({
            userId: "alice",
            password: "password123",
        })

        await expect(
            registerTeamUser({
                userId: "alice",
                password: "another-password",
            }),
        ).rejects.toThrow("already exists")
    })

    it("rejects weak registration input", async () => {
        await expect(
            registerTeamUser({
                userId: "ab",
                password: "password123",
            }),
        ).rejects.toThrow("User ID")
        await expect(
            registerTeamUser({
                userId: "alice",
                password: "short",
            }),
        ).rejects.toThrow("Password")
    })
})
