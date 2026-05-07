// @vitest-environment node
import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DELETE as deleteMember } from "@/app/api/admin/members/[userId]/route"
import { GET as listMembers } from "@/app/api/admin/members/route"
import { PATCH as updateRegistration } from "@/app/api/admin/registration/route"
import { createEmptySession } from "@/lib/session-storage"
import {
    createUserCookie,
    registerTeamUser,
    updateTeamUser,
} from "@/lib/team-auth"
import {
    countSessionsForUser,
    hasModelConfigForUser,
    saveModelConfigForUser,
    saveSessionForUser,
} from "@/lib/team-data-store"
import {
    createEmptyConfig,
    createProviderConfig,
} from "@/lib/types/model-config"

const ORIGINAL_ENV = { ...process.env }
let tmpDir: string

async function authRequest(user: { id: string; name?: string }) {
    const cookie = await createUserCookie(user)
    return new Request("http://localhost/api/admin/members", {
        headers: { cookie: `${cookie.name}=${cookie.value}` },
    })
}

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "drawio-admin-route-"))
    process.env.AUTH_SECRET = "test-secret"
    process.env.TEAM_USERS_FILE = path.join(tmpDir, "users.json")
    process.env.TEAM_DATA_DIR = tmpDir
})

afterEach(async () => {
    process.env.AUTH_SECRET = ORIGINAL_ENV.AUTH_SECRET
    process.env.TEAM_USERS_FILE = ORIGINAL_ENV.TEAM_USERS_FILE
    process.env.TEAM_DATA_DIR = ORIGINAL_ENV.TEAM_DATA_DIR
    await fs.rm(tmpDir, { recursive: true, force: true })
})

describe("admin members route", () => {
    it("requires authentication and administrator access", async () => {
        await registerTeamUser({ userId: "admin", password: "password123" })
        const member = await registerTeamUser({
            userId: "member",
            password: "password123",
        })

        const unauthenticated = await listMembers(
            new Request("http://localhost/api/admin/members"),
        )
        expect(unauthenticated.status).toBe(401)

        const forbidden = await listMembers(await authRequest(member))
        expect(forbidden.status).toBe(403)
    })

    it("returns sanitized member records", async () => {
        const admin = await registerTeamUser({
            userId: "admin",
            password: "password123",
        })
        await registerTeamUser({ userId: "member", password: "password123" })

        await saveSessionForUser(
            { ...createEmptySession(), id: "member-session" },
            "member",
        )
        const config = createEmptyConfig()
        config.providers = [createProviderConfig("openai")]
        await saveModelConfigForUser("member", config)

        const response = await listMembers(await authRequest(admin))
        expect(response.status).toBe(200)
        const data = await response.json()
        const member = data.members.find(
            (candidate: { id: string }) => candidate.id === "member",
        )
        expect(member.passwordHash).toBeUndefined()
        expect(member.sessionCount).toBe(1)
        expect(member.hasModelConfig).toBe(true)
    })

    it("lets administrators toggle registration", async () => {
        const admin = await registerTeamUser({
            userId: "admin",
            password: "password123",
        })

        const initial = await listMembers(await authRequest(admin))
        await expect(initial.json()).resolves.toMatchObject({
            registrationEnabled: false,
        })

        const cookie = await createUserCookie(admin)
        const response = await updateRegistration(
            new Request("http://localhost/api/admin/registration", {
                method: "PATCH",
                headers: {
                    "content-type": "application/json",
                    cookie: `${cookie.name}=${cookie.value}`,
                },
                body: JSON.stringify({ registrationEnabled: true }),
            }),
        )
        expect(response.status).toBe(200)

        const updated = await listMembers(await authRequest(admin))
        await expect(updated.json()).resolves.toMatchObject({
            registrationEnabled: true,
        })
    })

    it("deletes member data with the account", async () => {
        const admin = await registerTeamUser({
            userId: "admin",
            password: "password123",
        })
        await registerTeamUser({ userId: "member", password: "password123" })
        await registerTeamUser({
            userId: "second-admin",
            password: "password123",
        })
        await updateTeamUser({
            actorUserId: "admin",
            targetUserId: "second-admin",
            role: "admin",
        })

        await saveSessionForUser(
            { ...createEmptySession(), id: "member-session" },
            "member",
        )
        const config = createEmptyConfig()
        config.providers = [createProviderConfig("openai")]
        await saveModelConfigForUser("member", config)

        const response = await deleteMember(await authRequest(admin), {
            params: Promise.resolve({ userId: "member" }),
        })
        expect(response.status).toBe(200)
        await expect(countSessionsForUser("member")).resolves.toBe(0)
        await expect(hasModelConfigForUser("member")).resolves.toBe(false)

        const listResponse = await listMembers(await authRequest(admin))
        const data = await listResponse.json()
        expect(
            data.members.some(
                (candidate: { id: string }) => candidate.id === "member",
            ),
        ).toBe(false)
    })
})
