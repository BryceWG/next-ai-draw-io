import { NextResponse } from "next/server"
import {
    createUserCookie,
    getAuthCookieSecure,
    isTeamAuthEnabled,
    loadTeamUsers,
    verifyPasswordHash,
} from "@/lib/team-auth"

export const runtime = "nodejs"

export async function POST(req: Request) {
    if (!isTeamAuthEnabled()) {
        return NextResponse.json({
            authenticated: true,
            authEnabled: false,
            user: { id: "anonymous", name: "Anonymous" },
        })
    }

    let body: { userId?: string; password?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: "Invalid request body" },
            { status: 400 },
        )
    }

    const userId = body.userId?.trim()
    const password = body.password || ""
    if (!userId || !password) {
        return NextResponse.json(
            { error: "User ID and password are required" },
            { status: 400 },
        )
    }

    try {
        const users = await loadTeamUsers()
        const user = users.find((candidate) => candidate.id === userId)
        if (!user || !(await verifyPasswordHash(password, user.passwordHash))) {
            return NextResponse.json(
                { error: "Invalid user ID or password" },
                { status: 401 },
            )
        }

        const cookie = await createUserCookie(user)
        const response = NextResponse.json({
            authenticated: true,
            authEnabled: true,
            user: { id: user.id, name: user.name },
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
        console.error("[auth/login] Failed to authenticate:", error)
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Authentication failed",
            },
            { status: 500 },
        )
    }
}
