"use client"

import { LockKeyhole } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getApiEndpoint } from "@/lib/base-path"
import { i18n, type Locale } from "@/lib/i18n/config"

function normalizeNext(value: string | null, lang: string): string {
    if (!value?.startsWith("/") || value.startsWith("//")) {
        return `/${lang}`
    }
    if (value.includes("/login")) {
        return `/${lang}`
    }
    return value
}

function LoginLoading() {
    return (
        <main className="min-h-screen bg-background flex items-center justify-center p-6">
            <div className="text-sm text-muted-foreground">Loading...</div>
        </main>
    )
}

function LoginContent() {
    const params = useParams<{ lang: Locale }>()
    const router = useRouter()
    const searchParams = useSearchParams()
    const lang = i18n.locales.includes(params.lang) ? params.lang : "en"
    const nextPath = useMemo(
        () => normalizeNext(searchParams.get("next"), lang),
        [searchParams, lang],
    )

    const [userId, setUserId] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [isRegisterMode, setIsRegisterMode] = useState(false)
    const [registrationEnabled, setRegistrationEnabled] = useState(false)
    const [error, setError] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isChecking, setIsChecking] = useState(true)

    useEffect(() => {
        let cancelled = false
        fetch(getApiEndpoint("/api/auth/me"))
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return
                if (!data.authEnabled || data.authenticated) {
                    router.replace(nextPath)
                    return
                }
                setRegistrationEnabled(data.registrationEnabled === true)
                setIsChecking(false)
            })
            .catch(() => {
                if (!cancelled) {
                    setIsChecking(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [nextPath, router])

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!userId.trim() || !password) return
        if (isRegisterMode && password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        setError("")
        setIsSubmitting(true)
        try {
            const response = await fetch(
                getApiEndpoint(
                    isRegisterMode ? "/api/auth/register" : "/api/auth/login",
                ),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId: userId.trim(),
                        password,
                        name: displayName.trim() || undefined,
                    }),
                },
            )
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                setError(
                    data.error ||
                        (isRegisterMode
                            ? "Registration failed"
                            : "Login failed"),
                )
                return
            }
            router.replace(nextPath)
        } catch {
            setError("Network error. Please try again.")
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isChecking) {
        return <LoginLoading />
    }

    return (
        <main className="min-h-screen bg-background flex items-center justify-center p-6">
            <div className="w-full max-w-sm border border-border/60 bg-card rounded-lg shadow-soft p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <LockKeyhole className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">
                            {isRegisterMode ? "Create Account" : "Team Login"}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {isRegisterMode
                                ? "Register to use Next AI Drawio"
                                : "Sign in to use Next AI Drawio"}
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {isRegisterMode && (
                        <div className="space-y-2">
                            <Label htmlFor="display-name">Display Name</Label>
                            <Input
                                id="display-name"
                                value={displayName}
                                onChange={(event) =>
                                    setDisplayName(event.target.value)
                                }
                                autoComplete="name"
                            />
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="user-id">User ID</Label>
                        <Input
                            id="user-id"
                            value={userId}
                            onChange={(event) => setUserId(event.target.value)}
                            autoComplete="username"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            autoComplete="current-password"
                        />
                    </div>
                    {isRegisterMode && (
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">
                                Confirm Password
                            </Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(event) =>
                                    setConfirmPassword(event.target.value)
                                }
                                autoComplete="new-password"
                            />
                        </div>
                    )}

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={
                            isSubmitting ||
                            !userId.trim() ||
                            !password ||
                            (isRegisterMode && !confirmPassword)
                        }
                    >
                        {isSubmitting
                            ? isRegisterMode
                                ? "Creating..."
                                : "Signing in..."
                            : isRegisterMode
                              ? "Create account"
                              : "Sign in"}
                    </Button>
                </form>

                {registrationEnabled && (
                    <button
                        type="button"
                        className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                            setError("")
                            setIsRegisterMode((value) => !value)
                        }}
                    >
                        {isRegisterMode
                            ? "Already have an account? Sign in"
                            : "Need an account? Register"}
                    </button>
                )}
            </div>
        </main>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginLoading />}>
            <LoginContent />
        </Suspense>
    )
}
