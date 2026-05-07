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
const MIN_PASSWORD_LENGTH = 8

export type TeamUserRole = "admin" | "member"

export interface TeamUser {
    id: string
    name?: string
    passwordHash: string
    role?: TeamUserRole
    disabled?: boolean
    createdAt?: number
    updatedAt?: number
}

export interface AuthenticatedUser {
    id: string
    name?: string
    role: TeamUserRole
    isAdmin: boolean
    authEnabled: boolean
}

interface TeamAuthSettings {
    version: 1
    registrationEnabled: boolean
}

export function isTeamAuthEnabled(): boolean {
    return !!(process.env.AUTH_SECRET && process.env.TEAM_USERS_FILE)
}

export function getTeamUsersFile(): string {
    return process.env.TEAM_USERS_FILE || "/app/config/users.json"
}

function getTeamAuthSettingsFile(): string {
    return path.join(path.dirname(getTeamUsersFile()), "auth-settings.json")
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

function normalizeRole(value: unknown, index: number): TeamUserRole {
    if (value === "admin" || value === "member") return value
    return index === 0 ? "admin" : "member"
}

function normalizeTeamUsers(users: TeamUser[]): TeamUser[] {
    return users.map((user, index) => ({
        ...user,
        role: normalizeRole(user.role, index),
        disabled: user.disabled === true,
    }))
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
            role: normalizeRole(user.role, index),
            disabled: user.disabled === true,
            createdAt:
                typeof user.createdAt === "number" ? user.createdAt : undefined,
            updatedAt:
                typeof user.updatedAt === "number" ? user.updatedAt : undefined,
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

async function withFileLock<T>(
    filePath: string,
    action: () => Promise<T>,
): Promise<T> {
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
    const normalizedUsers = normalizeTeamUsers(users)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(
        tmpPath,
        `${JSON.stringify(normalizedUsers, null, 2)}\n`,
        "utf8",
    )
    await fs.rename(tmpPath, filePath)
}

async function loadTeamAuthSettings(): Promise<TeamAuthSettings | null> {
    try {
        const raw = await fs.readFile(getTeamAuthSettingsFile(), "utf8")
        const data = JSON.parse(raw) as Partial<TeamAuthSettings>
        return {
            version: 1,
            registrationEnabled: data.registrationEnabled === true,
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null
        }
        throw error
    }
}

async function writeTeamAuthSettings(
    settings: TeamAuthSettings,
): Promise<void> {
    const filePath = getTeamAuthSettingsFile()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(
        tmpPath,
        `${JSON.stringify(settings, null, 2)}\n`,
        "utf8",
    )
    await fs.rename(tmpPath, filePath)
}

export async function isTeamRegistrationEnabled(): Promise<boolean> {
    if (!isTeamAuthEnabled()) return false

    const users = await loadTeamUsersIfPresent()
    if (users.length === 0) return true

    const settings = await loadTeamAuthSettings()
    return settings?.registrationEnabled === true
}

export async function setTeamRegistrationEnabled(
    registrationEnabled: boolean,
): Promise<TeamAuthSettings> {
    return withFileLock(getTeamAuthSettingsFile(), async () => {
        const settings: TeamAuthSettings = {
            version: 1,
            registrationEnabled,
        }
        await writeTeamAuthSettings(settings)
        return settings
    })
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
    const passwordValidation = validatePassword(input.password)
    if (!passwordValidation.ok) return passwordValidation
    if (input.name && input.name.length > 80) {
        return {
            ok: false,
            error: "Display name must be 80 characters or fewer",
        }
    }
    return { ok: true }
}

function validatePassword(
    password: string,
): { ok: true } | { ok: false; error: string } {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return {
            ok: false,
            error: "Password must be at least 8 characters",
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

        const now = Date.now()
        const user: TeamUser = {
            id: userId,
            name: name || undefined,
            passwordHash: await hashPassword(input.password),
            role: users.length === 0 ? "admin" : "member",
            disabled: false,
            createdAt: now,
            updatedAt: now,
        }
        await writeTeamUsers([...users, user])
        return user
    })
}

export async function findTeamUser(userId: string): Promise<TeamUser | null> {
    const users = await loadTeamUsers()
    return users.find((user) => user.id === userId) || null
}

export type PublicTeamMember = Omit<TeamUser, "passwordHash"> & {
    role: TeamUserRole
    disabled: boolean
}

export async function listPublicTeamMembers(): Promise<PublicTeamMember[]> {
    const users = await loadTeamUsers()
    return users.map(({ passwordHash: _passwordHash, ...user }) => ({
        ...user,
        role: user.role || "member",
        disabled: user.disabled === true,
    }))
}

function countActiveAdmins(users: TeamUser[]): number {
    return users.filter(
        (user) => user.role === "admin" && user.disabled !== true,
    ).length
}

function assertCanChangeAdminAccess(
    users: TeamUser[],
    target: TeamUser,
    changes: { role?: TeamUserRole; disabled?: boolean },
) {
    const nextUsers = users.map((user) =>
        user.id === target.id ? { ...user, ...changes } : user,
    )
    if (countActiveAdmins(nextUsers) === 0) {
        throw new Error("At least one active administrator is required")
    }
}

export async function updateTeamUser(input: {
    actorUserId: string
    targetUserId: string
    name?: string | null
    role?: TeamUserRole
    disabled?: boolean
}): Promise<PublicTeamMember> {
    return withUserFileLock(async () => {
        const users = await loadTeamUsersIfPresent()
        const index = users.findIndex((user) => user.id === input.targetUserId)
        if (index < 0) throw new Error("User not found")

        const target = users[index]
        if (input.disabled === true && target.id === input.actorUserId) {
            throw new Error("Administrators cannot disable their own account")
        }
        if (input.role || input.disabled !== undefined) {
            assertCanChangeAdminAccess(users, target, {
                role: input.role,
                disabled: input.disabled,
            })
        }

        const name =
            input.name === undefined
                ? target.name
                : input.name?.trim() || undefined
        if (name && name.length > 80) {
            throw new Error("Display name must be 80 characters or fewer")
        }

        const updated: TeamUser = {
            ...target,
            name,
            role: input.role || target.role || "member",
            disabled:
                input.disabled === undefined
                    ? target.disabled === true
                    : input.disabled,
            updatedAt: Date.now(),
        }
        users[index] = updated
        await writeTeamUsers(users)
        const { passwordHash: _passwordHash, ...member } = updated
        return {
            ...member,
            role: member.role || "member",
            disabled: member.disabled === true,
        }
    })
}

export async function updateTeamUserPassword(input: {
    targetUserId: string
    password: string
}): Promise<void> {
    const validation = validatePassword(input.password)
    if (!validation.ok) throw new Error(validation.error)

    return withUserFileLock(async () => {
        const users = await loadTeamUsersIfPresent()
        const index = users.findIndex((user) => user.id === input.targetUserId)
        if (index < 0) throw new Error("User not found")

        users[index] = {
            ...users[index],
            passwordHash: await hashPassword(input.password),
            updatedAt: Date.now(),
        }
        await writeTeamUsers(users)
    })
}

export async function deleteTeamUser(input: {
    actorUserId: string
    targetUserId: string
}): Promise<void> {
    return withUserFileLock(async () => {
        const users = await loadTeamUsersIfPresent()
        const target = users.find((user) => user.id === input.targetUserId)
        if (!target) throw new Error("User not found")
        if (target.id === input.actorUserId) {
            throw new Error("Administrators cannot delete their own account")
        }
        assertCanChangeAdminAccess(
            users.filter((user) => user.id !== target.id),
            target,
            {},
        )
        await writeTeamUsers(users.filter((user) => user.id !== target.id))
    })
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
        return {
            id: "anonymous",
            name: "Anonymous",
            role: "admin",
            isAdmin: true,
            authEnabled: false,
        }
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
    if (!user || user.disabled === true) return null

    return {
        id: user.id,
        name: user.name,
        role: user.role || "member",
        isAdmin: user.role === "admin",
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

export async function requireAdmin(
    req: Request,
): Promise<
    { ok: true; user: AuthenticatedUser } | { ok: false; response: Response }
> {
    if (!isTeamAuthEnabled()) {
        return {
            ok: false,
            response: Response.json(
                { error: "Team authentication is required" },
                { status: 404 },
            ),
        }
    }

    const auth = await requireUser(req)
    if (!auth.ok) return auth
    if (!auth.user.isAdmin) {
        return {
            ok: false,
            response: Response.json(
                { error: "Administrator access required" },
                { status: 403 },
            ),
        }
    }
    return auth
}
