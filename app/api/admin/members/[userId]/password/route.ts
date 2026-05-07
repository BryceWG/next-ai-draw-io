import { NextResponse } from "next/server"
import { requireAdmin, updateTeamUserPassword } from "@/lib/team-auth"

export const runtime = "nodejs"

interface RouteContext {
    params: Promise<{ userId: string }>
}

export async function POST(req: Request, context: RouteContext) {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const { userId } = await context.params
    const body = await req.json().catch(() => null)
    const password = typeof body?.password === "string" ? body.password : ""
    if (!password) {
        return NextResponse.json(
            { error: "Password is required" },
            { status: 400 },
        )
    }

    try {
        await updateTeamUserPassword({ targetUserId: userId, password })
        return NextResponse.json({ ok: true })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Password reset failed"
        return NextResponse.json(
            { error: message },
            { status: message === "User not found" ? 404 : 400 },
        )
    }
}
