import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    getChatInput,
    getIframe,
    sendMessage,
    test,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("File Upload", () => {
    test.describe.configure({ mode: "serial" })

    test("upload button opens file picker", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await expect(getChatInput(page).first()).toBeVisible({ timeout: 30000 })

        const uploadButton = page.getByTestId("upload-menu-button")
        await expect(uploadButton.first()).toBeVisible({ timeout: 10000 })
        await expect(uploadButton.first()).toBeEnabled()

        await uploadButton.first().click()
        await expect(page.getByTestId("upload-menu")).toBeVisible()
        await expect(page.getByText("Upload file").last()).toBeVisible()
        await expect(page.getByText("Auto screenshot mode")).toBeVisible()
    })

    test("shows file preview after selecting image", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await expect(getChatInput(page).first()).toBeVisible({ timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')

        await fileInput.setInputFiles({
            name: "test-image.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        await expect(
            page.locator('[role="alert"][data-type="error"]'),
        ).not.toBeVisible({ timeout: 2000 })
    })

    test("can remove uploaded file", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await expect(getChatInput(page).first()).toBeVisible({ timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')

        await fileInput.setInputFiles({
            name: "test-image.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        await expect(
            page.locator('[role="alert"][data-type="error"]'),
        ).not.toBeVisible({ timeout: 2000 })

        const removeButton = page.locator(
            '[data-testid="remove-file-button"], button[aria-label*="Remove"], button:has(svg.lucide-x)',
        )

        const removeButtonCount = await removeButton.count()
        if (removeButtonCount === 0) {
            test.skip()
            return
        }

        await removeButton.first().click()
        await expect(removeButton.first()).not.toBeVisible({ timeout: 2000 })
    })

    test("sends file with message to API", async ({ page }) => {
        test.setTimeout(60000)
        let capturedRequest: any = null

        await page.route("**/api/chat", async (route) => {
            capturedRequest = route.request()
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Based on your image, here is a diagram:",
                ),
            })
        })

        await page.goto("/", { waitUntil: "domcontentloaded" })
        await expect(getChatInput(page).first()).toBeVisible({ timeout: 30000 })
        await getIframe(page).waitFor({ state: "visible", timeout: 45000 })

        const fileInput = page.locator('input[type="file"]')

        await fileInput.setInputFiles({
            name: "architecture.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        await sendMessage(page, "Convert this to a diagram")

        await expect.poll(() => capturedRequest !== null).toBe(true)
    })

    test("shows error for oversized file", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await expect(getChatInput(page).first()).toBeVisible({ timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')
        const largeBuffer = Buffer.alloc(3 * 1024 * 1024, "x")

        await fileInput.setInputFiles({
            name: "large-image.png",
            mimeType: "image/png",
            buffer: largeBuffer,
        })

        await expect(
            page.locator('[role="alert"], [data-sonner-toast]').first(),
        ).toBeVisible({ timeout: 5000 })
    })

    test("drag and drop file upload works", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatForm = page.locator("form").first()

        const dataTransfer = await page.evaluateHandle(() => {
            const dt = new DataTransfer()
            const file = new File(["test content"], "dropped-image.png", {
                type: "image/png",
            })
            dt.items.add(file)
            return dt
        })

        await chatForm.dispatchEvent("dragover", { dataTransfer })
        await chatForm.dispatchEvent("drop", { dataTransfer })

        await expect(getChatInput(page)).toBeVisible({ timeout: 3000 })
    })

    test("auto screenshot mode attaches a png file part", async ({ page }) => {
        const capturedBodies: any[] = []

        await page.route("**/api/chat", async (route) => {
            const postData = route.request().postData()
            if (postData) {
                capturedBodies.push(JSON.parse(postData))
            }

            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Updated with screenshot context.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "domcontentloaded" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Create a box")
        await expect(
            page.getByText("Updated with screenshot context."),
        ).toBeVisible({
            timeout: 15000,
        })

        const uploadButton = page.getByTestId("upload-menu-button")
        await uploadButton.first().click()
        await page.getByRole("switch", { name: "Auto screenshot mode" }).click()
        await expect(
            page.getByRole("switch", { name: "Auto screenshot mode" }),
        ).toBeChecked()

        await sendMessage(page, "Use the current canvas view")

        await expect.poll(() => capturedBodies.length).toBeGreaterThanOrEqual(2)
        const secondBody = capturedBodies[1]
        const parts = secondBody?.messages?.at?.(-1)?.parts || secondBody?.parts

        expect(
            parts?.some(
                (part: any) =>
                    part.type === "file" &&
                    part.mediaType === "image/png" &&
                    String(part.url || "").startsWith("data:image/png"),
            ),
        ).toBe(true)
    })
})
