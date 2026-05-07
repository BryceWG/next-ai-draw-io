import { NextResponse } from "next/server"
import {
    getUserFromRequest,
    isTeamAuthEnabled,
    isTeamRegistrationEnabled,
} from "@/lib/team-auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
    try {
        const user = await getUserFromRequest(req)
        return NextResponse.json({
            authEnabled: isTeamAuthEnabled(),
            registrationEnabled: await isTeamRegistrationEnabled(),
            authenticated: !!user,
            user: user
                ? {
                      id: user.id,
                      name: user.name,
                      role: user.role,
                      isAdmin: user.isAdmin,
                  }
                : null,
        })
    } catch (error) {
        console.error("[auth/me] Failed to resolve user:", error)
        return NextResponse.json(
            {
                authEnabled: isTeamAuthEnabled(),
                registrationEnabled: await isTeamRegistrationEnabled(),
                authenticated: false,
            },
            { status: 500 },
        )
    }
}
