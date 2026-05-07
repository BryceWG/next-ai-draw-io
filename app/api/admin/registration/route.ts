import { NextResponse } from "next/server"
import {
    isTeamRegistrationEnabled,
    requireAdmin,
    setTeamRegistrationEnabled,
} from "@/lib/team-auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    return NextResponse.json({
        registrationEnabled: await isTeamRegistrationEnabled(),
    })
}

export async function PATCH(req: Request) {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => null)
    if (typeof body?.registrationEnabled !== "boolean") {
        return NextResponse.json(
            { error: "registrationEnabled must be a boolean" },
            { status: 400 },
        )
    }

    const settings = await setTeamRegistrationEnabled(body.registrationEnabled)
    return NextResponse.json({
        registrationEnabled: settings.registrationEnabled,
    })
}
