import { NextResponse } from "next/server"
import {
    isTeamRegistrationEnabled,
    listPublicTeamMembers,
    requireAdmin,
} from "@/lib/team-auth"
import {
    countSessionsForUser,
    hasModelConfigForUser,
} from "@/lib/team-data-store"

export const runtime = "nodejs"

export async function GET(req: Request) {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response

    const members = await Promise.all(
        (await listPublicTeamMembers()).map(async (member) => ({
            ...member,
            sessionCount: await countSessionsForUser(member.id),
            hasModelConfig: await hasModelConfigForUser(member.id),
        })),
    )

    return NextResponse.json({
        members,
        registrationEnabled: await isTeamRegistrationEnabled(),
    })
}
