import { nanoid } from "nanoid"
import { getApiEndpoint } from "@/lib/base-path"

export interface ChatSession {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messages: StoredMessage[]
    xmlSnapshots: [number, string][]
    diagramXml: string
    thumbnailDataUrl?: string
    diagramHistory?: { svg: string; xml: string }[]
}

export interface StoredMessage {
    id: string
    role: "user" | "assistant" | "system"
    parts: Array<{ type: string; [key: string]: unknown }>
}

export interface SessionMetadata {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messageCount: number
    hasDiagram: boolean
    thumbnailDataUrl?: string
}

async function fetchJson<T>(
    input: string,
    init?: RequestInit,
): Promise<T | null> {
    try {
        const response = await fetch(getApiEndpoint(input), {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...init?.headers,
            },
        })
        if (!response.ok) {
            console.error(
                `Session request failed: ${response.status} ${response.statusText}`,
            )
            return null
        }
        return (await response.json()) as T
    } catch (error) {
        console.error("Session request failed:", error)
        return null
    }
}

export function isIndexedDBAvailable(): boolean {
    return typeof window !== "undefined"
}

export async function isIndexedDBUsable(): Promise<boolean> {
    return typeof window !== "undefined"
}

export async function getAllSessionMetadata(): Promise<SessionMetadata[]> {
    const data = await fetchJson<{ sessions: SessionMetadata[] }>(
        "/api/sessions",
    )
    return data?.sessions || []
}

export async function getSession(id: string): Promise<ChatSession | null> {
    const data = await fetchJson<{ session: ChatSession }>(
        `/api/sessions/${encodeURIComponent(id)}`,
    )
    return data?.session || null
}

export async function saveSession(session: ChatSession): Promise<boolean> {
    const endpoint = `/api/sessions/${encodeURIComponent(session.id)}`
    const data = await fetchJson<{ session: ChatSession }>(endpoint, {
        method: "PUT",
        body: JSON.stringify({ session }),
    })
    return !!data?.session
}

export async function createSession(session: ChatSession): Promise<boolean> {
    const data = await fetchJson<{ session: ChatSession }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ session }),
    })
    return !!data?.session
}

export async function deleteSession(id: string): Promise<void> {
    await fetchJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
    })
}

export async function getSessionCount(): Promise<number> {
    const metadata = await getAllSessionMetadata()
    return metadata.length
}

export async function deleteOldestSession(): Promise<void> {
    const metadata = await getAllSessionMetadata()
    const oldest = [...metadata].sort((a, b) => a.updatedAt - b.updatedAt)[0]
    if (oldest) {
        await deleteSession(oldest.id)
    }
}

export async function enforceSessionLimit(): Promise<void> {
    // Server-backed storage intentionally keeps all sessions for small teams.
}

export function createEmptySession(): ChatSession {
    const now = Date.now()
    return {
        id: nanoid(),
        title: "New Chat",
        createdAt: now,
        updatedAt: now,
        messages: [],
        xmlSnapshots: [],
        diagramXml: "",
    }
}

const MAX_TITLE_LENGTH = 100

export function extractTitle(messages: StoredMessage[]): string {
    const firstUserMessage = messages.find((m) => m.role === "user")
    if (!firstUserMessage) return "New Chat"

    const textPart = firstUserMessage.parts.find((p) => p.type === "text")
    if (!textPart || typeof textPart.text !== "string") return "New Chat"

    const text = textPart.text.trim()
    if (!text) return "New Chat"

    if (text.length > MAX_TITLE_LENGTH) {
        return `${text.slice(0, MAX_TITLE_LENGTH).trim()}...`
    }
    return text
}

export function sanitizeMessage(message: unknown): StoredMessage | null {
    if (!message || typeof message !== "object") return null

    const msg = message as Record<string, unknown>
    if (!msg.id || !msg.role) return null

    const role = msg.role as string
    if (!["user", "assistant", "system"].includes(role)) return null

    let parts: Array<{ type: string; [key: string]: unknown }> = []
    if (Array.isArray(msg.parts)) {
        parts = msg.parts.map((part: unknown) => {
            if (!part || typeof part !== "object") return { type: "unknown" }
            const p = part as Record<string, unknown>
            const { isStreaming, streamingState, ...cleanPart } = p
            return cleanPart as { type: string; [key: string]: unknown }
        })
    }

    return {
        id: msg.id as string,
        role: role as "user" | "assistant" | "system",
        parts,
    }
}

export function sanitizeMessages(messages: unknown[]): StoredMessage[] {
    return messages
        .map(sanitizeMessage)
        .filter((m): m is StoredMessage => m !== null)
}

export async function migrateFromLocalStorage(): Promise<string | null> {
    return null
}
