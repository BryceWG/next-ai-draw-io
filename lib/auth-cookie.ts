export const AUTH_COOKIE_NAME = "next-ai-drawio-auth"

export interface AuthTokenPayload {
    userId: string
    name?: string
    iat: number
    exp: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = ""
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "")
}

function base64UrlToBytes(value: string): Uint8Array {
    const padded = value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=")
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false

    let diff = 0
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i]
    }
    return diff === 0
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    )
    return new Uint8Array(
        await crypto.subtle.sign("HMAC", key, encoder.encode(data)),
    )
}

export async function signAuthToken(
    payload: AuthTokenPayload,
    secret: string,
): Promise<string> {
    const payloadBytes = encoder.encode(JSON.stringify(payload))
    const encodedPayload = bytesToBase64Url(payloadBytes)
    const signature = await hmacSha256(secret, encodedPayload)
    return `${encodedPayload}.${bytesToBase64Url(signature)}`
}

export async function verifyAuthToken(
    token: string | undefined | null,
    secret: string | undefined,
): Promise<AuthTokenPayload | null> {
    if (!token || !secret) return null

    const [encodedPayload, encodedSignature] = token.split(".")
    if (!encodedPayload || !encodedSignature) return null

    try {
        const expected = await hmacSha256(secret, encodedPayload)
        const actual = base64UrlToBytes(encodedSignature)
        if (!constantTimeEqual(expected, actual)) return null

        const payload = JSON.parse(
            decoder.decode(base64UrlToBytes(encodedPayload)),
        ) as Partial<AuthTokenPayload>
        if (
            typeof payload.userId !== "string" ||
            typeof payload.iat !== "number" ||
            typeof payload.exp !== "number"
        ) {
            return null
        }
        if (payload.exp <= Date.now()) return null

        return {
            userId: payload.userId,
            name: typeof payload.name === "string" ? payload.name : undefined,
            iat: payload.iat,
            exp: payload.exp,
        }
    } catch {
        return null
    }
}
