import { NextResponse } from "next/server"
import {
    deleteTeamUser,
    requireAdmin,
    type TeamUserRole,
    updateTeamUser,
} from "@/lib/team-auth"
import { deleteTeamDataForUser } from "@/lib/team-data-store"

export const runtime = "nodejs"

interface RouteContext {
    params: Promise<{ userId: string }>
}

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Request failed"
    const status = message === "User not found" ? 404 : 400
    return NextResponse.json({ error: message }, { status })
}

export async function PATCH(req: Request, context: RouteContext) {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const { userId } = await context.params
    const body = await req.json().catch(() => null)
    const role = body?.role
    const disabled = body?.disabled
    const name = body?.name

    if (role !== undefined && role !== "admin" && role !== "member") {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }
    if (disabled !== undefined && typeof disabled !== "boolean") {
        return NextResponse.json(
            { error: "Invalid disabled value" },
            { status: 400 },
        )
    }
    if (name !== undefined && name !== null && typeof name !== "string") {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 })
    }

    try {
        const member = await updateTeamUser({
            actorUserId: auth.user.id,
            targetUserId: userId,
            name,
            role: role as TeamUserRole | undefined,
            disabled,
        })
        return NextResponse.json({ member })
    } catch (error) {
        return errorResponse(error)
    }
}

export async function DELETE(req: Request, context: RouteContext) {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const { userId } = await context.params
    try {
        await deleteTeamUser({
            actorUserId: auth.user.id,
            targetUserId: userId,
        })
        await deleteTeamDataForUser(userId)
        return NextResponse.json({ ok: true })
    } catch (error) {
        return errorResponse(error)
    }
}
