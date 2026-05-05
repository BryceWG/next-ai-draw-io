import { NextResponse } from "next/server"
import { requireUser } from "@/lib/team-auth"
import {
    deleteOwnedSession,
    getSessionById,
    saveSessionForUser,
} from "@/lib/team-data-store"

export const runtime = "nodejs"

interface RouteContext {
    params: Promise<{ sessionId: string }>
}

export async function GET(req: Request, context: RouteContext) {
    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const { sessionId } = await context.params
    const session = await getSessionById(sessionId)
    if (!session) {
        return NextResponse.json(
            { error: "Session not found" },
            { status: 404 },
        )
    }
    return NextResponse.json({ session })
}

export async function PUT(req: Request, context: RouteContext) {
    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const { sessionId } = await context.params
    const body = await req.json().catch(() => null)
    const session = body?.session
    if (!session || session.id !== sessionId) {
        return NextResponse.json(
            { error: "Session payload must match the requested session id" },
            { status: 400 },
        )
    }

    const saved = await saveSessionForUser(session, auth.user.id)
    return NextResponse.json({ session: saved })
}

export async function DELETE(req: Request, context: RouteContext) {
    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const { sessionId } = await context.params
    const result = await deleteOwnedSession(sessionId, auth.user.id)
    if (result === "forbidden") {
        return NextResponse.json(
            { error: "Only the session owner can delete this session" },
            { status: 403 },
        )
    }
    if (result === "not-found") {
        return NextResponse.json(
            { error: "Session not found" },
            { status: 404 },
        )
    }
    return NextResponse.json({ ok: true })
}
