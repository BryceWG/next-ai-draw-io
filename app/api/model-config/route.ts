import { NextResponse } from "next/server"
import { requireUser } from "@/lib/team-auth"
import {
    getModelConfigForUser,
    saveModelConfigForUser,
} from "@/lib/team-data-store"

export const runtime = "nodejs"

export async function GET(req: Request) {
    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const config = await getModelConfigForUser(auth.user.id)
    return NextResponse.json({ config })
}

export async function PUT(req: Request) {
    const auth = await requireUser(req)
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => null)
    const config = body?.config
    if (!config || config.version !== 1 || !Array.isArray(config.providers)) {
        return NextResponse.json(
            { error: "Invalid model config payload" },
            { status: 400 },
        )
    }

    const saved = await saveModelConfigForUser(auth.user.id, config)
    return NextResponse.json({ config: saved })
}
