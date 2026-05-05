import { randomBytes, scrypt, timingSafeEqual } from "crypto"
import fs from "fs/promises"
import path from "path"
import { promisify } from "util"
import {
    AUTH_COOKIE_NAME,
    signAuthToken,
    verifyAuthToken,
} from "@/lib/auth-cookie"

const scryptAsync = promisify(scrypt)
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const USER_ID_PATTERN = /^[a-zA-Z0-9_.-]{3,40}$/
const userFileLocks = new Map<string, Promise<unknown>>()

export interface TeamUser {
    id: string
    name?: string
    passwordHash: string
}

export interface AuthenticatedUser {
    id: string
    name?: string
    authEnabled: boolean
}

export function isTeamAuthEnabled(): boolean {
    return !!(process.env.AUTH_SECRET && process.env.TEAM_USERS_FILE)
}

export function isTeamRegistrationEnabled(): boolean {
    return (
        isTeamAuthEnabled() && process.env.ENABLE_TEAM_REGISTRATION === "true"
    )
}

export function getTeamUsersFile(): string {
    return process.env.TEAM_USERS_FILE || "/app/config/users.json"
}

export function getAuthSecret(): string | undefined {
    return process.env.AUTH_SECRET
}

export function getAuthCookieSecure(): boolean {
    return process.env.AUTH_COOKIE_SECURE === "true"
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16)
    const derived = (await scryptAsync(password, salt, 64)) as Buffer
    return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`
}

export async function verifyPasswordHash(
    password: string,
    passwordHash: string,
): Promise<boolean> {
    const [scheme, saltB64, hashB64] = passwordHash.split("$")
    if (scheme !== "scrypt" || !saltB64 || !hashB64) return false

    const salt = Buffer.from(saltB64, "base64url")
    const expected = Buffer.from(hashB64, "base64url")
    const actual = (await scryptAsync(
        password,
        salt,
        expected.length,
    )) as Buffer
    return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
    )
}

function validateUsers(input: unknown): TeamUser[] {
    if (!Array.isArray(input)) {
        throw new Error("Team users file must contain a JSON array")
    }

    return input.map((item, index) => {
        if (!item || typeof item !== "object") {
            throw new Error(`Invalid user at index ${index}`)
        }
        const user = item as Record<string, unknown>
        if (typeof user.id !== "string" || !user.id.trim()) {
            throw new Error(`Missing user id at index ${index}`)
        }
        if (typeof user.passwordHash !== "string" || !user.passwordHash) {
            throw new Error(`Missing passwordHash for user ${user.id}`)
        }
        return {
            id: user.id.trim(),
            name:
                typeof user.name === "string" && user.name.trim()
                    ? user.name.trim()
                    : undefined,
            passwordHash: user.passwordHash,
        }
    })
}

export async function loadTeamUsers(): Promise<TeamUser[]> {
    const raw = await fs.readFile(getTeamUsersFile(), "utf8")
    return validateUsers(JSON.parse(raw))
}

async function loadTeamUsersIfPresent(): Promise<TeamUser[]> {
    try {
        return await loadTeamUsers()
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return []
        }
        throw error
    }
}

async function withUserFileLock<T>(action: () => Promise<T>): Promise<T> {
    const filePath = getTeamUsersFile()
    const previous = userFileLocks.get(filePath) || Promise.resolve()
    let release: () => void = () => {}
    const current = new Promise<void>((resolve) => {
        release = resolve
    })
    const chained = previous.then(() => current)
    userFileLocks.set(filePath, chained)

    await previous
    try {
        return await action()
    } finally {
        release()
        if (userFileLocks.get(filePath) === chained) {
            userFileLocks.delete(filePath)
        }
    }
}

async function writeTeamUsers(users: TeamUser[]): Promise<void> {
    const filePath = getTeamUsersFile()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmpPath, `${JSON.stringify(users, null, 2)}\n`, "utf8")
    await fs.rename(tmpPath, filePath)
}

export function validateNewUserInput(input: {
    userId: string
    password: string
    name?: string
}): { ok: true } | { ok: false; error: string } {
    if (!USER_ID_PATTERN.test(input.userId)) {
        return {
            ok: false,
            error: "User ID must be 3-40 characters and use only letters, numbers, dot, underscore, or hyphen",
        }
    }
    if (input.password.length < 8) {
        return {
            ok: false,
            error: "Password must be at least 8 characters",
        }
    }
    if (input.name && input.name.length > 80) {
        return {
            ok: false,
            error: "Display name must be 80 characters or fewer",
        }
    }
    return { ok: true }
}

export async function registerTeamUser(input: {
    userId: string
    password: string
    name?: string
}): Promise<TeamUser> {
    const userId = input.userId.trim()
    const name = input.name?.trim()
    const validation = validateNewUserInput({
        userId,
        password: input.password,
        name,
    })
    if (!validation.ok) {
        throw new Error(validation.error)
    }

    return withUserFileLock(async () => {
        const users = await loadTeamUsersIfPresent()
        if (users.some((user) => user.id === userId)) {
            throw new Error("User ID already exists")
        }

        const user: TeamUser = {
            id: userId,
            name: name || undefined,
            passwordHash: await hashPassword(input.password),
        }
        await writeTeamUsers([...users, user])
        return user
    })
}

export async function findTeamUser(userId: string): Promise<TeamUser | null> {
    const users = await loadTeamUsers()
    return users.find((user) => user.id === userId) || null
}

export async function createUserCookie(user: {
    id: string
    name?: string
}): Promise<{ name: string; value: string; expires: Date }> {
    const now = Date.now()
    const expires = new Date(now + DEFAULT_SESSION_TTL_MS)
    const secret = getAuthSecret()
    if (!secret) {
        throw new Error("AUTH_SECRET is required when team auth is enabled")
    }
    return {
        name: AUTH_COOKIE_NAME,
        value: await signAuthToken(
            {
                userId: user.id,
                name: user.name,
                iat: now,
                exp: expires.getTime(),
            },
            secret,
        ),
        expires,
    }
}

export async function getUserFromRequest(
    req: Request,
): Promise<AuthenticatedUser | null> {
    if (!isTeamAuthEnabled()) {
        return { id: "anonymous", name: "Anonymous", authEnabled: false }
    }

    const token = req.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))
        ?.slice(AUTH_COOKIE_NAME.length + 1)
    const payload = await verifyAuthToken(token, getAuthSecret())
    if (!payload) return null

    const user = await findTeamUser(payload.userId)
    if (!user) return null

    return {
        id: user.id,
        name: user.name,
        authEnabled: true,
    }
}

export async function requireUser(
    req: Request,
): Promise<
    { ok: true; user: AuthenticatedUser } | { ok: false; response: Response }
> {
    const user = await getUserFromRequest(req)
    if (!user) {
        return {
            ok: false,
            response: Response.json(
                { error: "Authentication required" },
                { status: 401 },
            ),
        }
    }
    return { ok: true, user }
}
