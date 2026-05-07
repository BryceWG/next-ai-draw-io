import fs from "fs/promises"
import path from "path"
import type { ChatSession, SessionMetadata } from "@/lib/session-storage"
import {
    createEmptyConfig,
    type MultiModelConfig,
} from "@/lib/types/model-config"

interface SessionRecord {
    ownerUserId: string
    updatedByUserId?: string
    session: ChatSession
}

interface SessionsFile {
    version: 1
    sessions: SessionRecord[]
}

interface ModelConfigsFile {
    version: 1
    configs: Record<string, MultiModelConfig>
}

const fileLocks = new Map<string, Promise<unknown>>()

function getDataDir(): string {
    if (process.env.TEAM_DATA_DIR) return process.env.TEAM_DATA_DIR
    return process.env.NODE_ENV === "production"
        ? "/app/data"
        : path.join(process.cwd(), "data")
}

function sessionsFilePath(): string {
    return path.join(getDataDir(), "sessions.json")
}

function modelConfigsFilePath(): string {
    return path.join(getDataDir(), "model-configs.json")
}

async function ensureParentDir(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
    try {
        const raw = await fs.readFile(filePath, "utf8")
        return JSON.parse(raw) as T
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return fallback
        }
        throw error
    }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    await ensureParentDir(filePath)
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
    await fs.rename(tmpPath, filePath)
}

async function withFileLock<T>(
    filePath: string,
    action: () => Promise<T>,
): Promise<T> {
    const previous = fileLocks.get(filePath) || Promise.resolve()
    let release: () => void = () => {}
    const current = new Promise<void>((resolve) => {
        release = resolve
    })
    const chained = previous.then(() => current)
    fileLocks.set(filePath, chained)

    await previous
    try {
        return await action()
    } finally {
        release()
        if (fileLocks.get(filePath) === chained) {
            fileLocks.delete(filePath)
        }
    }
}

function defaultSessionsFile(): SessionsFile {
    return { version: 1, sessions: [] }
}

function defaultModelConfigsFile(): ModelConfigsFile {
    return { version: 1, configs: {} }
}

function toMetadata(session: ChatSession): SessionMetadata {
    return {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        hasDiagram:
            !!session.diagramXml && session.diagramXml.trim().length > 0,
        thumbnailDataUrl: session.thumbnailDataUrl,
    }
}

export async function listSessionMetadataForUser(
    userId: string,
): Promise<SessionMetadata[]> {
    const data = await readJsonFile(sessionsFilePath(), defaultSessionsFile())
    return data.sessions
        .filter((record) => record.ownerUserId === userId)
        .map((record) => toMetadata(record.session))
        .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getSessionById(
    sessionId: string,
): Promise<ChatSession | null> {
    const data = await readJsonFile(sessionsFilePath(), defaultSessionsFile())
    return (
        data.sessions.find((record) => record.session.id === sessionId)
            ?.session || null
    )
}

export async function saveSessionForUser(
    session: ChatSession,
    userId: string,
): Promise<ChatSession> {
    return withFileLock(sessionsFilePath(), async () => {
        const data = await readJsonFile(
            sessionsFilePath(),
            defaultSessionsFile(),
        )
        const index = data.sessions.findIndex(
            (record) => record.session.id === session.id,
        )
        if (index >= 0) {
            data.sessions[index] = {
                ...data.sessions[index],
                updatedByUserId: userId,
                session,
            }
        } else {
            data.sessions.push({
                ownerUserId: userId,
                updatedByUserId: userId,
                session,
            })
        }
        await writeJsonFile(sessionsFilePath(), data)
        return session
    })
}

export async function deleteOwnedSession(
    sessionId: string,
    userId: string,
): Promise<"deleted" | "forbidden" | "not-found"> {
    return withFileLock(sessionsFilePath(), async () => {
        const data = await readJsonFile(
            sessionsFilePath(),
            defaultSessionsFile(),
        )
        const index = data.sessions.findIndex(
            (record) => record.session.id === sessionId,
        )
        if (index < 0) return "not-found"
        if (data.sessions[index].ownerUserId !== userId) return "forbidden"

        data.sessions.splice(index, 1)
        await writeJsonFile(sessionsFilePath(), data)
        return "deleted"
    })
}

export async function countSessionsForUser(userId: string): Promise<number> {
    const data = await readJsonFile(sessionsFilePath(), defaultSessionsFile())
    return data.sessions.filter((record) => record.ownerUserId === userId)
        .length
}

export async function getModelConfigForUser(
    userId: string,
): Promise<MultiModelConfig> {
    const data = await readJsonFile(
        modelConfigsFilePath(),
        defaultModelConfigsFile(),
    )
    return data.configs[userId] || createEmptyConfig()
}

export async function saveModelConfigForUser(
    userId: string,
    config: MultiModelConfig,
): Promise<MultiModelConfig> {
    return withFileLock(modelConfigsFilePath(), async () => {
        const data = await readJsonFile(
            modelConfigsFilePath(),
            defaultModelConfigsFile(),
        )
        data.configs[userId] = config
        await writeJsonFile(modelConfigsFilePath(), data)
        return config
    })
}

export async function hasModelConfigForUser(userId: string): Promise<boolean> {
    const data = await readJsonFile(
        modelConfigsFilePath(),
        defaultModelConfigsFile(),
    )
    return !!data.configs[userId]
}

export async function deleteTeamDataForUser(userId: string): Promise<void> {
    await withFileLock(sessionsFilePath(), async () => {
        const data = await readJsonFile(
            sessionsFilePath(),
            defaultSessionsFile(),
        )
        const filteredSessions = data.sessions.filter(
            (record) => record.ownerUserId !== userId,
        )
        if (filteredSessions.length !== data.sessions.length) {
            await writeJsonFile(sessionsFilePath(), {
                ...data,
                sessions: filteredSessions,
            })
        }
    })

    await withFileLock(modelConfigsFilePath(), async () => {
        const data = await readJsonFile(
            modelConfigsFilePath(),
            defaultModelConfigsFile(),
        )
        if (data.configs[userId]) {
            const configs = { ...data.configs }
            delete configs[userId]
            await writeJsonFile(modelConfigsFilePath(), {
                ...data,
                configs,
            })
        }
    })
}
