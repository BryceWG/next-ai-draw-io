import { match as matchLocale } from "@formatjs/intl-localematcher"
import Negotiator from "negotiator"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, verifyAuthToken } from "./lib/auth-cookie"
import { i18n } from "./lib/i18n/config"

function getLocale(request: NextRequest): string | undefined {
    // Negotiator expects plain object so we need to transform headers
    const negotiatorHeaders: Record<string, string> = {}
    request.headers.forEach((value, key) => {
        negotiatorHeaders[key] = value
    })

    // @ts-expect-error locales are readonly
    const locales: string[] = i18n.locales

    // Use negotiator and intl-localematcher to get best locale
    const languages = new Negotiator({ headers: negotiatorHeaders }).languages(
        locales,
    )

    const locale = matchLocale(languages, locales, i18n.defaultLocale)

    return locale
}

function isPublicAssetPath(pathname: string): boolean {
    return (
        pathname.startsWith("/_next/") ||
        pathname.startsWith("/drawio") ||
        pathname.includes("/favicon") ||
        /\.(.*)$/.test(pathname)
    )
}

function isLocalizedLoginPath(pathname: string): boolean {
    return i18n.locales.some(
        (locale) =>
            pathname === `/${locale}/login` ||
            pathname.startsWith(`/${locale}/login/`),
    )
}

function getLocaleFromPath(pathname: string): string | undefined {
    const segment = pathname.split("/").filter(Boolean)[0]
    return i18n.locales.includes(segment as any) ? segment : undefined
}

function isAuthEnabledForProxy(): boolean {
    return !!(process.env.AUTH_SECRET && process.env.TEAM_USERS_FILE)
}

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname

    if (isPublicAssetPath(pathname)) {
        return
    }

    // Check if there is any supported locale in the pathname
    const pathnameIsMissingLocale = i18n.locales.every(
        (locale) =>
            !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
    )

    // Redirect if there is no locale
    if (!pathname.startsWith("/api/") && pathnameIsMissingLocale) {
        const locale = getLocale(request)

        // Redirect to localized path
        return NextResponse.redirect(
            new URL(
                `/${locale}${pathname.startsWith("/") ? "" : "/"}${pathname}`,
                request.url,
            ),
        )
    }

    if (!isAuthEnabledForProxy()) {
        return
    }

    if (pathname.startsWith("/api/auth/")) {
        return
    }

    const payload = await verifyAuthToken(
        request.cookies.get(AUTH_COOKIE_NAME)?.value,
        process.env.AUTH_SECRET,
    )
    if (payload) {
        return
    }

    if (pathname.startsWith("/api/")) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        )
    }

    if (isLocalizedLoginPath(pathname)) {
        return
    }

    const locale = getLocaleFromPath(pathname) || getLocale(request)
    const loginUrl = new URL(`/${locale}/login`, request.url)
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
