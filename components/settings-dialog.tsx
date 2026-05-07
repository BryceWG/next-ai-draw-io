"use client"

import {
    ChevronRight,
    Github,
    Info,
    KeyRound,
    LogOut,
    Moon,
    RefreshCw,
    Shield,
    Sun,
    Tag,
    Trash2,
    Users,
} from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDictionary } from "@/hooks/use-dictionary"
import { getApiEndpoint } from "@/lib/base-path"
import { i18n, type Locale } from "@/lib/i18n/config"
import { STORAGE_KEYS } from "@/lib/storage"

// Reusable setting item component for consistent layout
function SettingItem({
    label,
    description,
    children,
}: {
    label: string
    description?: string
    children: React.ReactNode
}) {
    return (
        <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
            <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">{label}</Label>
                {description && (
                    <p className="text-xs text-muted-foreground max-w-[260px]">
                        {description}
                    </p>
                )}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    )
}

const LANGUAGE_LABELS: Record<Locale, string> = {
    en: "English",
    zh: "中文",
    ja: "日本語",
    "zh-Hant": "繁體中文",
}

interface SettingsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    drawioUi: "min" | "sketch"
    onToggleDrawioUi: () => void
    darkMode: boolean
    onToggleDarkMode: () => void
    minimalStyle?: boolean
    onMinimalStyleChange?: (value: boolean) => void
    vlmValidationEnabled?: boolean
    onVlmValidationChange?: (value: boolean) => void
    onOpenModelConfig?: () => void
    customSystemMessage?: string
    onCustomSystemMessageChange?: (value: string) => void
}

interface AdminMember {
    id: string
    name?: string
    role: "admin" | "member"
    disabled: boolean
    createdAt?: number
    updatedAt?: number
    sessionCount: number
    hasModelConfig: boolean
}

export const STORAGE_ACCESS_CODE_KEY = "next-ai-draw-io-access-code"
const STORAGE_ACCESS_CODE_REQUIRED_KEY = "next-ai-draw-io-access-code-required"

function getStoredAccessCodeRequired(): boolean | null {
    if (typeof window === "undefined") return null
    const stored = localStorage.getItem(STORAGE_ACCESS_CODE_REQUIRED_KEY)
    if (stored === null) return null
    return stored === "true"
}

function SettingsContent({
    open,
    onOpenChange,
    drawioUi,
    onToggleDrawioUi,
    darkMode,
    onToggleDarkMode,
    minimalStyle = false,
    onMinimalStyleChange = () => {},
    vlmValidationEnabled = false,
    onVlmValidationChange = () => {},
    onOpenModelConfig,
    customSystemMessage = "",
    onCustomSystemMessageChange = () => {},
}: SettingsDialogProps) {
    const dict = useDictionary()
    const router = useRouter()
    const pathname = usePathname() || "/"
    const search = useSearchParams()
    const [accessCode, setAccessCode] = useState("")
    const [isVerifying, setIsVerifying] = useState(false)
    const [error, setError] = useState("")
    const [accessCodeRequired, setAccessCodeRequired] = useState(
        () => getStoredAccessCodeRequired() ?? false,
    )
    const [authEnabled, setAuthEnabled] = useState(false)
    const [authUser, setAuthUser] = useState<{
        id: string
        name?: string
        role?: "admin" | "member"
        isAdmin?: boolean
    } | null>(null)
    const [adminMembers, setAdminMembers] = useState<AdminMember[]>([])
    const [teamRegistrationEnabled, setTeamRegistrationEnabled] =
        useState(false)
    const [isLoadingAdminMembers, setIsLoadingAdminMembers] = useState(false)
    const [isUpdatingRegistration, setIsUpdatingRegistration] = useState(false)
    const [adminMembersError, setAdminMembersError] = useState("")
    const [memberActionId, setMemberActionId] = useState<string | null>(null)
    const [passwordInputs, setPasswordInputs] = useState<
        Record<string, string>
    >({})
    const [currentLang, setCurrentLang] = useState("en")
    const [sendShortcut, setSendShortcut] = useState("ctrl-enter")

    // Panel visibility state
    const [showRecentChats, setShowRecentChats] = useState(true)
    const [showMyTemplates, setShowMyTemplates] = useState(true)
    const [showQuickExamples, setShowQuickExamples] = useState(true)

    const handlePanelToggle = useCallback(
        (key: string, value: boolean, setter: (v: boolean) => void) => {
            setter(value)
            localStorage.setItem(key, String(value))
            window.dispatchEvent(new CustomEvent("panelVisibilityChange"))
        },
        [],
    )

    // Proxy settings state (Electron only)
    const [httpProxy, setHttpProxy] = useState("")
    const [httpsProxy, setHttpsProxy] = useState("")
    const [isApplyingProxy, setIsApplyingProxy] = useState(false)

    const fetchAdminMembers = useCallback(async () => {
        setIsLoadingAdminMembers(true)
        setAdminMembersError("")
        try {
            const response = await fetch(getApiEndpoint("/api/admin/members"))
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(
                    data.error || dict.settings.adminLoadMembersFailed,
                )
            }
            setAdminMembers(Array.isArray(data.members) ? data.members : [])
            setTeamRegistrationEnabled(data.registrationEnabled === true)
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : dict.settings.adminLoadMembersFailed
            setAdminMembersError(message)
        } finally {
            setIsLoadingAdminMembers(false)
        }
    }, [dict.settings.adminLoadMembersFailed])

    const updateAdminMember = useCallback(
        async (
            memberId: string,
            updates: Partial<Pick<AdminMember, "role" | "disabled" | "name">>,
        ) => {
            setMemberActionId(memberId)
            try {
                const response = await fetch(
                    getApiEndpoint(
                        `/api/admin/members/${encodeURIComponent(memberId)}`,
                    ),
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(updates),
                    },
                )
                const data = await response.json().catch(() => ({}))
                if (!response.ok) {
                    throw new Error(
                        data.error || dict.settings.adminUpdateMemberFailed,
                    )
                }
                toast.success(dict.settings.adminMemberUpdated)
                await fetchAdminMembers()
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : dict.settings.adminUpdateMemberFailed,
                )
            } finally {
                setMemberActionId(null)
            }
        },
        [
            dict.settings.adminMemberUpdated,
            dict.settings.adminUpdateMemberFailed,
            fetchAdminMembers,
        ],
    )

    const updateRegistrationEnabled = useCallback(
        async (registrationEnabled: boolean) => {
            setIsUpdatingRegistration(true)
            try {
                const response = await fetch(
                    getApiEndpoint("/api/admin/registration"),
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ registrationEnabled }),
                    },
                )
                const data = await response.json().catch(() => ({}))
                if (!response.ok) {
                    throw new Error(
                        data.error ||
                            dict.settings.adminUpdateRegistrationFailed,
                    )
                }
                setTeamRegistrationEnabled(data.registrationEnabled === true)
                toast.success(dict.settings.adminRegistrationUpdated)
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : dict.settings.adminUpdateRegistrationFailed,
                )
            } finally {
                setIsUpdatingRegistration(false)
            }
        },
        [
            dict.settings.adminRegistrationUpdated,
            dict.settings.adminUpdateRegistrationFailed,
        ],
    )

    const resetMemberPassword = useCallback(
        async (memberId: string) => {
            const password = passwordInputs[memberId] || ""
            if (password.length < 8) {
                toast.error(dict.settings.adminPasswordTooShort)
                return
            }

            setMemberActionId(memberId)
            try {
                const response = await fetch(
                    getApiEndpoint(
                        `/api/admin/members/${encodeURIComponent(memberId)}/password`,
                    ),
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ password }),
                    },
                )
                const data = await response.json().catch(() => ({}))
                if (!response.ok) {
                    throw new Error(
                        data.error || dict.settings.adminResetPasswordFailed,
                    )
                }
                setPasswordInputs((current) => ({
                    ...current,
                    [memberId]: "",
                }))
                toast.success(dict.settings.adminPasswordReset)
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : dict.settings.adminResetPasswordFailed,
                )
            } finally {
                setMemberActionId(null)
            }
        },
        [
            dict.settings.adminPasswordReset,
            dict.settings.adminPasswordTooShort,
            dict.settings.adminResetPasswordFailed,
            passwordInputs,
        ],
    )

    const deleteAdminMember = useCallback(
        async (memberId: string) => {
            setMemberActionId(memberId)
            try {
                const response = await fetch(
                    getApiEndpoint(
                        `/api/admin/members/${encodeURIComponent(memberId)}`,
                    ),
                    { method: "DELETE" },
                )
                const data = await response.json().catch(() => ({}))
                if (!response.ok) {
                    throw new Error(
                        data.error || dict.settings.adminDeleteMemberFailed,
                    )
                }
                toast.success(dict.settings.adminMemberDeleted)
                await fetchAdminMembers()
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : dict.settings.adminDeleteMemberFailed,
                )
            } finally {
                setMemberActionId(null)
            }
        },
        [
            dict.settings.adminDeleteMemberFailed,
            dict.settings.adminMemberDeleted,
            fetchAdminMembers,
        ],
    )

    useEffect(() => {
        // Only fetch if not cached in localStorage
        if (getStoredAccessCodeRequired() !== null) return

        fetch(getApiEndpoint("/api/config"))
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json()
            })
            .then((data) => {
                const required = data?.accessCodeRequired === true
                localStorage.setItem(
                    STORAGE_ACCESS_CODE_REQUIRED_KEY,
                    String(required),
                )
                setAccessCodeRequired(required)
            })
            .catch(() => {
                // Don't cache on error - allow retry on next mount
                setAccessCodeRequired(false)
            })
    }, [])

    // Detect current language from pathname
    useEffect(() => {
        const seg = pathname.split("/").filter(Boolean)
        const first = seg[0]
        if (first && i18n.locales.includes(first as Locale)) {
            setCurrentLang(first)
        } else {
            setCurrentLang(i18n.defaultLocale)
        }
    }, [pathname])

    useEffect(() => {
        if (open) {
            const storedCode =
                localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
            setAccessCode(storedCode)

            const storedSendShortcut = localStorage.getItem(
                STORAGE_KEYS.sendShortcut,
            )
            setSendShortcut(storedSendShortcut || "ctrl-enter")

            setShowRecentChats(
                localStorage.getItem(STORAGE_KEYS.showRecentChats) !== "false",
            )
            setShowMyTemplates(
                localStorage.getItem(STORAGE_KEYS.showMyTemplates) !== "false",
            )
            setShowQuickExamples(
                localStorage.getItem(STORAGE_KEYS.showQuickExamples) !==
                    "false",
            )

            setError("")

            fetch(getApiEndpoint("/api/auth/me"))
                .then((res) => res.json())
                .then((data) => {
                    setAuthEnabled(data.authEnabled === true)
                    setAuthUser(data.user || null)
                    if (data.user?.isAdmin === true) {
                        fetchAdminMembers()
                    } else {
                        setAdminMembers([])
                        setTeamRegistrationEnabled(false)
                    }
                })
                .catch(() => {
                    setAuthEnabled(false)
                    setAuthUser(null)
                    setAdminMembers([])
                    setTeamRegistrationEnabled(false)
                })

            // Load proxy settings (Electron only)
            if (window.electronAPI?.getProxy) {
                window.electronAPI.getProxy().then((config) => {
                    setHttpProxy(config.httpProxy || "")
                    setHttpsProxy(config.httpsProxy || "")
                })
            }
        }
    }, [open, fetchAdminMembers])

    const handleLogout = async () => {
        await fetch(getApiEndpoint("/api/auth/logout"), { method: "POST" })
        router.replace(`/${currentLang}/login`)
    }

    const changeLanguage = (lang: string) => {
        // Save locale to localStorage for persistence across restarts
        localStorage.setItem("next-ai-draw-io-locale", lang)

        // Notify Electron main process to update its menu language
        if (window.electronAPI?.setUserLocale) {
            window.electronAPI.setUserLocale(lang).catch((error) => {
                console.error("Failed to sync locale with Electron:", error)
            })
        }

        const parts = pathname.split("/")
        if (parts.length > 1 && i18n.locales.includes(parts[1] as Locale)) {
            parts[1] = lang
        } else {
            parts.splice(1, 0, lang)
        }
        const newPath = parts.join("/") || "/"
        const searchStr = search?.toString() ? `?${search.toString()}` : ""
        router.push(newPath + searchStr)
    }

    const handleSave = async () => {
        if (!accessCodeRequired) return

        setError("")
        setIsVerifying(true)

        try {
            const response = await fetch(
                getApiEndpoint("/api/verify-access-code"),
                {
                    method: "POST",
                    headers: {
                        "x-access-code": accessCode.trim(),
                    },
                },
            )

            const data = await response.json()

            if (!data.valid) {
                setError(data.message || dict.errors.invalidAccessCode)
                return
            }

            localStorage.setItem(STORAGE_ACCESS_CODE_KEY, accessCode.trim())
            onOpenChange(false)
        } catch {
            setError(dict.errors.networkError)
        } finally {
            setIsVerifying(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault()
            handleSave()
        }
    }

    const handleApplyProxy = async () => {
        if (!window.electronAPI?.setProxy) return

        // Validate proxy URLs (must start with http:// or https://)
        const validateProxyUrl = (url: string): boolean => {
            if (!url) return true // Empty is OK
            return url.startsWith("http://") || url.startsWith("https://")
        }

        const trimmedHttp = httpProxy.trim()
        const trimmedHttps = httpsProxy.trim()

        if (trimmedHttp && !validateProxyUrl(trimmedHttp)) {
            toast.error("HTTP Proxy must start with http:// or https://")
            return
        }
        if (trimmedHttps && !validateProxyUrl(trimmedHttps)) {
            toast.error("HTTPS Proxy must start with http:// or https://")
            return
        }

        setIsApplyingProxy(true)
        try {
            const result = await window.electronAPI.setProxy({
                httpProxy: trimmedHttp || undefined,
                httpsProxy: trimmedHttps || undefined,
            })

            if (result.success) {
                toast.success(dict.settings.proxyApplied)
            } else {
                toast.error(result.error || "Failed to apply proxy settings")
            }
        } catch {
            toast.error("Failed to apply proxy settings")
        } finally {
            setIsApplyingProxy(false)
        }
    }

    return (
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle>{dict.settings.title}</DialogTitle>
                <DialogDescription className="mt-1">
                    {dict.settings.description}
                </DialogDescription>
            </DialogHeader>

            {/* Content */}
            <div className="px-6 pb-6 overflow-y-auto flex-1 scrollbar-thin">
                <div className="divide-y divide-border-subtle">
                    {/* API Keys & Models */}
                    {onOpenModelConfig && (
                        <SettingItem
                            label={dict.settings.apiKeysModels}
                            description={dict.settings.apiKeysModelsDescription}
                        >
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 p-0"
                                onClick={() => {
                                    onOpenChange(false)
                                    onOpenModelConfig()
                                }}
                                aria-label={dict.settings.apiKeysModels}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </SettingItem>
                    )}

                    {authEnabled && authUser && (
                        <SettingItem
                            label={dict.settings.teamAccount}
                            description={authUser.name || authUser.id}
                        >
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleLogout}
                                className="h-9 rounded-xl"
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                {dict.settings.signOut}
                            </Button>
                        </SettingItem>
                    )}

                    {authUser?.isAdmin && (
                        <div className="py-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium flex items-center gap-2">
                                        <Shield className="h-4 w-4" />
                                        {dict.settings.adminPanel}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        {dict.settings.adminPanelDescription}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchAdminMembers}
                                    disabled={isLoadingAdminMembers}
                                    className="h-8 rounded-xl"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    {dict.settings.adminRefresh}
                                </Button>
                            </div>

                            {adminMembersError && (
                                <p className="text-xs text-destructive">
                                    {adminMembersError}
                                </p>
                            )}

                            <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium">
                                        {dict.settings.adminRegistrationToggle}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {
                                            dict.settings
                                                .adminRegistrationToggleDescription
                                        }
                                    </p>
                                </div>
                                <Switch
                                    checked={teamRegistrationEnabled}
                                    disabled={isUpdatingRegistration}
                                    onCheckedChange={updateRegistrationEnabled}
                                />
                            </div>

                            <div className="space-y-2">
                                {isLoadingAdminMembers &&
                                    adminMembers.length === 0 && (
                                        <div className="text-xs text-muted-foreground border border-border-subtle rounded-lg p-3">
                                            {dict.settings.adminLoadingMembers}
                                        </div>
                                    )}
                                {!isLoadingAdminMembers &&
                                    adminMembers.length === 0 &&
                                    !adminMembersError && (
                                        <div className="text-xs text-muted-foreground border border-border-subtle rounded-lg p-3">
                                            {dict.settings.adminNoMembers}
                                        </div>
                                    )}
                                {adminMembers.map((member) => {
                                    const isSelf = member.id === authUser.id
                                    const isBusy = memberActionId === member.id
                                    return (
                                        <div
                                            key={member.id}
                                            className="border border-border-subtle rounded-lg p-3 space-y-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        <p className="text-sm font-medium truncate">
                                                            {member.name ||
                                                                member.id}
                                                        </p>
                                                        {isSelf && (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                                                {
                                                                    dict
                                                                        .settings
                                                                        .adminYou
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {member.id}
                                                    </p>
                                                </div>
                                                <span className="text-xs text-muted-foreground shrink-0">
                                                    {member.disabled
                                                        ? dict.settings
                                                              .adminDisabled
                                                        : dict.settings
                                                              .adminActive}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                <span>
                                                    {
                                                        dict.settings
                                                            .adminSessionCount
                                                    }
                                                    : {member.sessionCount}
                                                </span>
                                                <span>
                                                    {
                                                        dict.settings
                                                            .adminModelConfig
                                                    }
                                                    :{" "}
                                                    {member.hasModelConfig
                                                        ? dict.settings.yes
                                                        : dict.settings.no}
                                                </span>
                                            </div>

                                            <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                                                <Select
                                                    value={member.role}
                                                    disabled={isBusy}
                                                    onValueChange={(role) =>
                                                        updateAdminMember(
                                                            member.id,
                                                            {
                                                                role: role as AdminMember["role"],
                                                            },
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger className="h-8 rounded-xl">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="admin">
                                                            {
                                                                dict.settings
                                                                    .adminRoleAdmin
                                                            }
                                                        </SelectItem>
                                                        <SelectItem value="member">
                                                            {
                                                                dict.settings
                                                                    .adminRoleMember
                                                            }
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>

                                                <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3">
                                                    <span className="text-xs text-muted-foreground">
                                                        {
                                                            dict.settings
                                                                .adminAccountEnabled
                                                        }
                                                    </span>
                                                    <Switch
                                                        checked={
                                                            !member.disabled
                                                        }
                                                        disabled={
                                                            isBusy || isSelf
                                                        }
                                                        onCheckedChange={(
                                                            enabled,
                                                        ) =>
                                                            updateAdminMember(
                                                                member.id,
                                                                {
                                                                    disabled:
                                                                        !enabled,
                                                                },
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                <Input
                                                    type="password"
                                                    value={
                                                        passwordInputs[
                                                            member.id
                                                        ] || ""
                                                    }
                                                    onChange={(event) =>
                                                        setPasswordInputs(
                                                            (current) => ({
                                                                ...current,
                                                                [member.id]:
                                                                    event.target
                                                                        .value,
                                                            }),
                                                        )
                                                    }
                                                    placeholder={
                                                        dict.settings
                                                            .adminNewPassword
                                                    }
                                                    className="h-8"
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={
                                                        isBusy ||
                                                        !passwordInputs[
                                                            member.id
                                                        ]
                                                    }
                                                    onClick={() =>
                                                        resetMemberPassword(
                                                            member.id,
                                                        )
                                                    }
                                                    className="h-8 rounded-xl"
                                                >
                                                    <KeyRound className="h-3.5 w-3.5" />
                                                    {
                                                        dict.settings
                                                            .adminResetPassword
                                                    }
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            disabled={
                                                                isBusy || isSelf
                                                            }
                                                            className="h-8 rounded-xl"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            {
                                                                dict.settings
                                                                    .adminDelete
                                                            }
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>
                                                                {
                                                                    dict
                                                                        .settings
                                                                        .adminDeleteConfirmTitle
                                                                }
                                                            </AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                {dict.settings.adminDeleteConfirmDescription.replace(
                                                                    "{userId}",
                                                                    member.id,
                                                                )}
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>
                                                                {
                                                                    dict.common
                                                                        .cancel
                                                                }
                                                            </AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() =>
                                                                    deleteAdminMember(
                                                                        member.id,
                                                                    )
                                                                }
                                                                className="bg-destructive text-white hover:bg-destructive/90"
                                                            >
                                                                {
                                                                    dict
                                                                        .settings
                                                                        .adminDelete
                                                                }
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Access Code (conditional) */}
                    {accessCodeRequired && (
                        <div className="py-4 first:pt-0 space-y-3">
                            <div className="space-y-0.5">
                                <Label
                                    htmlFor="access-code"
                                    className="text-sm font-medium"
                                >
                                    {dict.settings.accessCode}
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    {dict.settings.accessCodeDescription}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    id="access-code"
                                    type="password"
                                    value={accessCode}
                                    onChange={(e) =>
                                        setAccessCode(e.target.value)
                                    }
                                    onKeyDown={handleKeyDown}
                                    placeholder={
                                        dict.settings.accessCodePlaceholder
                                    }
                                    autoComplete="off"
                                    className="h-9"
                                />
                                <Button
                                    onClick={handleSave}
                                    disabled={isVerifying || !accessCode.trim()}
                                    className="h-9 px-4 rounded-xl"
                                >
                                    {isVerifying ? "..." : dict.common.save}
                                </Button>
                            </div>
                            {error && (
                                <p className="text-xs text-destructive">
                                    {error}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Language */}
                    <SettingItem
                        label={dict.settings.language}
                        description={dict.settings.languageDescription}
                    >
                        <Select
                            value={currentLang}
                            onValueChange={changeLanguage}
                        >
                            <SelectTrigger
                                id="language-select"
                                className="w-[120px] h-9 rounded-xl"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {i18n.locales.map((locale) => (
                                    <SelectItem key={locale} value={locale}>
                                        {LANGUAGE_LABELS[locale]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </SettingItem>

                    {/* Theme */}
                    <SettingItem
                        label={dict.settings.theme}
                        description={dict.settings.themeDescription}
                    >
                        <Button
                            id="theme-toggle"
                            variant="outline"
                            size="icon"
                            onClick={onToggleDarkMode}
                            className="h-9 w-9 rounded-xl border-border-subtle hover:bg-interactive-hover"
                        >
                            {darkMode ? (
                                <Sun className="h-4 w-4" />
                            ) : (
                                <Moon className="h-4 w-4" />
                            )}
                        </Button>
                    </SettingItem>

                    {/* Draw.io Style */}
                    <SettingItem
                        label={dict.settings.drawioStyle}
                        description={`${dict.settings.drawioStyleDescription} ${
                            drawioUi === "min"
                                ? dict.settings.minimal
                                : dict.settings.sketch
                        }`}
                    >
                        <Button
                            id="drawio-ui"
                            variant="outline"
                            onClick={onToggleDrawioUi}
                            className="h-9 w-[120px] rounded-xl border-border-subtle hover:bg-interactive-hover font-normal"
                        >
                            {dict.settings.switchTo}{" "}
                            {drawioUi === "min"
                                ? dict.settings.sketch
                                : dict.settings.minimal}
                        </Button>
                    </SettingItem>

                    {/* Diagram Style */}
                    <SettingItem
                        label={dict.settings.diagramStyle}
                        description={dict.settings.diagramStyleDescription}
                    >
                        <div className="flex items-center gap-2">
                            <Switch
                                id="minimal-style"
                                checked={minimalStyle}
                                onCheckedChange={onMinimalStyleChange}
                            />
                            <span className="text-sm text-muted-foreground">
                                {minimalStyle
                                    ? dict.chat.minimalStyle
                                    : dict.chat.styledMode}
                            </span>
                        </div>
                    </SettingItem>

                    {/* Panel Visibility */}
                    <SettingItem
                        label={dict.settings.panelVisibility}
                        description={dict.settings.panelVisibilityDescription}
                    >
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                    id="show-recent-chats"
                                    checked={showRecentChats}
                                    onCheckedChange={(v) =>
                                        handlePanelToggle(
                                            STORAGE_KEYS.showRecentChats,
                                            v,
                                            setShowRecentChats,
                                        )
                                    }
                                />
                                <span className="text-xs text-muted-foreground">
                                    {dict.settings.showRecentChats}
                                </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                    id="show-my-templates"
                                    checked={showMyTemplates}
                                    onCheckedChange={(v) =>
                                        handlePanelToggle(
                                            STORAGE_KEYS.showMyTemplates,
                                            v,
                                            setShowMyTemplates,
                                        )
                                    }
                                />
                                <span className="text-xs text-muted-foreground">
                                    {dict.settings.showMyTemplates}
                                </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Switch
                                    id="show-quick-examples"
                                    checked={showQuickExamples}
                                    onCheckedChange={(v) =>
                                        handlePanelToggle(
                                            STORAGE_KEYS.showQuickExamples,
                                            v,
                                            setShowQuickExamples,
                                        )
                                    }
                                />
                                <span className="text-xs text-muted-foreground">
                                    {dict.settings.showQuickExamples}
                                </span>
                            </label>
                        </div>
                    </SettingItem>

                    {/* VLM Diagram Validation */}
                    <SettingItem
                        label={dict.settings.diagramValidation}
                        description={dict.settings.diagramValidationDescription}
                    >
                        <div className="flex items-center gap-2">
                            <Switch
                                id="vlm-validation"
                                checked={vlmValidationEnabled}
                                onCheckedChange={onVlmValidationChange}
                            />
                            <span className="text-sm text-muted-foreground">
                                {vlmValidationEnabled
                                    ? dict.settings.enabled
                                    : dict.settings.disabled}
                            </span>
                        </div>
                    </SettingItem>

                    {/* Custom System Message */}
                    <div className="py-4 space-y-3">
                        <div className="space-y-0.5">
                            <Label
                                htmlFor="custom-system-message"
                                className="text-sm font-medium"
                            >
                                {dict.settings.customSystemMessage}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                {dict.settings.customSystemMessageDescription}
                            </p>
                        </div>
                        <Textarea
                            id="custom-system-message"
                            value={customSystemMessage}
                            onChange={(e) =>
                                onCustomSystemMessageChange(e.target.value)
                            }
                            placeholder={
                                dict.settings.customSystemMessagePlaceholder
                            }
                            className="min-h-[80px] max-h-[160px] text-sm"
                            maxLength={5000}
                        />
                    </div>

                    {/* Send Shortcut */}
                    <SettingItem
                        label={dict.settings.sendShortcut}
                        description={dict.settings.sendShortcutDescription}
                    >
                        <Select
                            value={sendShortcut}
                            onValueChange={(value) => {
                                setSendShortcut(value)
                                localStorage.setItem(
                                    STORAGE_KEYS.sendShortcut,
                                    value,
                                )
                                window.dispatchEvent(
                                    new CustomEvent("sendShortcutChange", {
                                        detail: value,
                                    }),
                                )
                            }}
                        >
                            <SelectTrigger
                                id="send-shortcut-select"
                                className="w-auto h-9 rounded-xl"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="enter">
                                    {dict.settings.enterToSend}
                                </SelectItem>
                                <SelectItem value="ctrl-enter">
                                    {dict.settings.ctrlEnterToSend}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingItem>

                    {/* Proxy Settings - Electron only */}
                    {typeof window !== "undefined" &&
                        window.electronAPI?.isElectron && (
                            <div className="py-4 space-y-3">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">
                                        {dict.settings.proxy}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        {dict.settings.proxyDescription}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Input
                                        id="http-proxy"
                                        type="text"
                                        value={httpProxy}
                                        onChange={(e) =>
                                            setHttpProxy(e.target.value)
                                        }
                                        placeholder={`${dict.settings.httpProxy}: http://proxy:8080`}
                                        className="h-9"
                                    />
                                    <Input
                                        id="https-proxy"
                                        type="text"
                                        value={httpsProxy}
                                        onChange={(e) =>
                                            setHttpsProxy(e.target.value)
                                        }
                                        placeholder={`${dict.settings.httpsProxy}: http://proxy:8080`}
                                        className="h-9"
                                    />
                                </div>

                                <Button
                                    onClick={handleApplyProxy}
                                    disabled={isApplyingProxy}
                                    className="h-9 px-4 rounded-xl w-full"
                                >
                                    {isApplyingProxy
                                        ? "..."
                                        : dict.settings.applyProxy}
                                </Button>
                            </div>
                        )}
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border-subtle bg-surface-1/50 rounded-b-2xl">
                <div className="flex items-center justify-center gap-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {process.env.APP_VERSION}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <a
                        href="https://github.com/DayuanJiang/next-ai-draw-io"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                        <Github className="h-3 w-3" />
                        GitHub
                    </a>
                    {process.env.NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE ===
                        "true" && (
                        <>
                            <span className="text-muted-foreground">·</span>
                            <a
                                href={`/${currentLang}/about${currentLang === "zh" ? "/cn" : currentLang === "ja" ? "/ja" : ""}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                                <Info className="h-3 w-3" />
                                {dict.nav.about}
                            </a>
                        </>
                    )}
                </div>
            </div>
        </DialogContent>
    )
}

export function SettingsDialog(props: SettingsDialogProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <Suspense
                fallback={
                    <DialogContent className="sm:max-w-lg p-0">
                        <div className="h-80 flex items-center justify-center">
                            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                        </div>
                    </DialogContent>
                }
            >
                <SettingsContent {...props} />
            </Suspense>
        </Dialog>
    )
}
