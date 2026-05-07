import { NextResponse } from "next/server"
import {
    createUserCookie,
    getAuthCookieSecure,
    isTeamRegistrationEnabled,
    registerTeamUser,
} from "@/lib/team-auth"

export const runtime = "nodejs"

export async function POST(req: Request) {
    if (!(await isTeamRegistrationEnabled())) {
        return NextResponse.json(
            { error: "Registration is disabled" },
            { status: 404 },
        )
    }

    const body = await req.json().catch(() => null)
    const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
    const password = typeof body?.password === "string" ? body.password : ""
    const name = typeof body?.name === "string" ? body.name.trim() : undefined

    try {
        const user = await registerTeamUser({ userId, password, name })
        const cookie = await createUserCookie(user)
        const response = NextResponse.json({
            authenticated: true,
            authEnabled: true,
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                isAdmin: user.role === "admin",
            },
        })
        response.cookies.set(cookie.name, cookie.value, {
            httpOnly: true,
            sameSite: "lax",
            secure: getAuthCookieSecure(),
            path: "/",
            expires: cookie.expires,
        })
        return response
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Registration failed",
            },
            { status: 400 },
        )
    }
}
