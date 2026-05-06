import { NextResponse } from "next/server"
import { loadPublicServerModels } from "@/lib/server-model-config"

// Use dynamic rendering to read AI_MODEL/AI_PROVIDER env vars at runtime
// This ensures Docker users can set these values when starting containers
export const dynamic = "force-dynamic"

export async function GET() {
    const models = await loadPublicServerModels()
    return NextResponse.json({
        models,
        hasConfig: models.length > 0,
    })
}
