// @vitest-environment node
import { describe, expect, it } from "vitest"
import { signAuthToken, verifyAuthToken } from "@/lib/auth-cookie"

describe("auth cookie tokens", () => {
    it("verifies a signed token", async () => {
        const token = await signAuthToken(
            {
                userId: "alice",
                name: "Alice",
                iat: Date.now(),
                exp: Date.now() + 60_000,
            },
            "secret",
        )

        const payload = await verifyAuthToken(token, "secret")
        expect(payload?.userId).toBe("alice")
        expect(payload?.name).toBe("Alice")
    })

    it("rejects tampered tokens", async () => {
        const token = await signAuthToken(
            {
                userId: "alice",
                iat: Date.now(),
                exp: Date.now() + 60_000,
            },
            "secret",
        )

        const [payload, signature] = token.split(".")
        const tamperedPayload = `${payload.slice(0, -1)}${
            payload.endsWith("A") ? "B" : "A"
        }`
        const tampered = `${tamperedPayload}.${signature}`
        await expect(verifyAuthToken(tampered, "secret")).resolves.toBeNull()
        await expect(verifyAuthToken(token, "wrong-secret")).resolves.toBeNull()
    })

    it("rejects expired tokens", async () => {
        const token = await signAuthToken(
            {
                userId: "alice",
                iat: Date.now() - 120_000,
                exp: Date.now() - 60_000,
            },
            "secret",
        )

        await expect(verifyAuthToken(token, "secret")).resolves.toBeNull()
    })
})
