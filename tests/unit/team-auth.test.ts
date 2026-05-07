// @vitest-environment node
import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
    createUserCookie,
    deleteTeamUser,
    getUserFromRequest,
    hashPassword,
    isTeamRegistrationEnabled,
    loadTeamUsers,
    registerTeamUser,
    setTeamRegistrationEnabled,
    updateTeamUser,
    updateTeamUserPassword,
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
    it("allows bootstrap registration, then uses the stored setting", async () => {
        await expect(isTeamRegistrationEnabled()).resolves.toBe(true)

        await registerTeamUser({
            userId: "alice",
            password: "password123",
        })
        await expect(isTeamRegistrationEnabled()).resolves.toBe(false)

        await setTeamRegistrationEnabled(true)
        await expect(isTeamRegistrationEnabled()).resolves.toBe(true)

        process.env.ENABLE_TEAM_REGISTRATION = "false"
        await expect(isTeamRegistrationEnabled()).resolves.toBe(true)
    })

    it("creates a user in the team users file", async () => {
        const user = await registerTeamUser({
            userId: "alice",
            name: "Alice",
            password: "password123",
        })

        expect(user.id).toBe("alice")
        expect(user.name).toBe("Alice")
        expect(user.role).toBe("admin")

        const users = await loadTeamUsers()
        expect(users).toHaveLength(1)
        expect(users[0].id).toBe("alice")
        expect(users[0].role).toBe("admin")
        await expect(
            verifyPasswordHash("password123", users[0].passwordHash),
        ).resolves.toBe(true)
    })

    it("makes only the first registered user an administrator", async () => {
        await registerTeamUser({
            userId: "alice",
            password: "password123",
        })
        await registerTeamUser({
            userId: "bob",
            password: "password123",
        })

        const users = await loadTeamUsers()
        expect(users.map((user) => [user.id, user.role])).toEqual([
            ["alice", "admin"],
            ["bob", "member"],
        ])
    })

    it("treats the first legacy user as administrator", async () => {
        await fs.writeFile(
            process.env.TEAM_USERS_FILE || "",
            JSON.stringify([
                {
                    id: "legacy-admin",
                    passwordHash: await hashPassword("password123"),
                },
                {
                    id: "legacy-member",
                    passwordHash: await hashPassword("password123"),
                },
            ]),
        )

        const users = await loadTeamUsers()
        expect(users.map((user) => [user.id, user.role])).toEqual([
            ["legacy-admin", "admin"],
            ["legacy-member", "member"],
        ])
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

    it("rejects disabled users during request authentication", async () => {
        const user = await registerTeamUser({
            userId: "alice",
            password: "password123",
        })
        await registerTeamUser({
            userId: "bob",
            password: "password123",
        })
        await updateTeamUser({
            actorUserId: "alice",
            targetUserId: "bob",
            role: "admin",
        })
        await updateTeamUser({
            actorUserId: "bob",
            targetUserId: "alice",
            disabled: true,
        })
        const cookie = await createUserCookie(user)

        const request = new Request("http://localhost/api/auth/me", {
            headers: { cookie: `${cookie.name}=${cookie.value}` },
        })

        await expect(getUserFromRequest(request)).resolves.toBeNull()
    })

    it("prevents removing the last active administrator", async () => {
        await registerTeamUser({
            userId: "alice",
            password: "password123",
        })

        await expect(
            updateTeamUser({
                actorUserId: "alice",
                targetUserId: "alice",
                role: "member",
            }),
        ).rejects.toThrow("At least one active administrator")
        await expect(
            deleteTeamUser({
                actorUserId: "system-admin",
                targetUserId: "alice",
            }),
        ).rejects.toThrow("At least one active administrator")
    })

    it("updates passwords through the admin helper", async () => {
        await registerTeamUser({
            userId: "alice",
            password: "password123",
        })

        await updateTeamUserPassword({
            targetUserId: "alice",
            password: "new-password",
        })

        const users = await loadTeamUsers()
        await expect(
            verifyPasswordHash("new-password", users[0].passwordHash),
        ).resolves.toBe(true)
        await expect(
            verifyPasswordHash("password123", users[0].passwordHash),
        ).resolves.toBe(false)
    })

    it("updates passwords for legacy users with non-registration IDs", async () => {
        await fs.writeFile(
            process.env.TEAM_USERS_FILE || "",
            JSON.stringify([
                {
                    id: "legacy@example.com",
                    passwordHash: await hashPassword("password123"),
                    role: "admin",
                },
            ]),
        )

        await updateTeamUserPassword({
            targetUserId: "legacy@example.com",
            password: "new-password",
        })

        const users = await loadTeamUsers()
        await expect(
            verifyPasswordHash("new-password", users[0].passwordHash),
        ).resolves.toBe(true)
    })
})
