import { afterEach, describe, expect, it } from "vitest"
import { POST } from "@/app/api/chat/route"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
    process.env.AUTH_SECRET = ORIGINAL_ENV.AUTH_SECRET
    process.env.TEAM_USERS_FILE = ORIGINAL_ENV.TEAM_USERS_FILE
    process.env.ACCESS_CODE_LIST = ORIGINAL_ENV.ACCESS_CODE_LIST
    process.env.AI_MODELS_CONFIG = ORIGINAL_ENV.AI_MODELS_CONFIG
    process.env.AI_MODELS_CONFIG_PATH = ORIGINAL_ENV.AI_MODELS_CONFIG_PATH
})

describe("chat route server model selection", () => {
    it("rejects a selected server model id that is not configured", async () => {
        process.env.AUTH_SECRET = ""
        process.env.TEAM_USERS_FILE = ""
        process.env.ACCESS_CODE_LIST = ""
        process.env.AI_MODELS_CONFIG = JSON.stringify({ providers: [] })
        process.env.AI_MODELS_CONFIG_PATH = ""

        const response = await POST(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-selected-model-id": "server:missing:model",
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: "user",
                            parts: [{ type: "text", text: "Create a diagram" }],
                        },
                    ],
                    xml: "<mxfile></mxfile>",
                    previousXml: "",
                    sessionId: "test-session",
                }),
            }),
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
            error: "Selected server model is not configured",
        })
    })
})
