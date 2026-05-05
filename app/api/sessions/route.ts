import { NextResponse } from "next/server"
import { requireUser } from "@/lib/team-auth"
import {
    listSessionMetadataForUser,
    saveSessionForUser,
} from "@/lib/team-data-store"

export const runtime = "nodejs"

export async function GET(req: Request) {
    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const sessions = await listSessionMetadataForUser(auth.user.id)
    return NextResponse.json({ sessions })
}

export async function POST(req: Request) {
    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => null)
    const session = body?.session
    if (!session || typeof session.id !== "string") {
        return NextResponse.json(
            { error: "A session payload with an id is required" },
            { status: 400 },
        )
    }

    const saved = await saveSessionForUser(session, auth.user.id)
    return NextResponse.json({ session: saved })
}
