"use client";

import {useEffect, useMemo, useState} from "react";
import {useRouter} from "next/navigation";
import {Button, Card, Column, Flex, Heading, Row, Spinner, Text} from "@once-ui-system/core";
import {moonSite} from "@/resources";
import {resolveKavitaBaseUrl} from "@/utils/kavitaLinks";
import {hasMoonPermission} from "@/utils/moonPermissions";
import {SetupModeGate} from "./SetupModeGate";
import {AuthGate} from "./AuthGate";
import {RAVEN_TITLE_CARD_WIDTH, RavenTitleCard, type RavenTitleCardEntry} from "./RavenTitleCard";

type AuthStatusResponse = {
    user?: {
        permissions?: string[] | null;
    } | null;
};

type DiscordInviteResponse = {
    inviteUrl?: string | null;
};

const normalizeString = (value: unknown): string => (typeof value === "string" ? value : "");

const normalizeAbsoluteHttpUrl = (value: unknown): string => {
    const normalized = normalizeString(value).trim();
    if (!normalized) {
        return "";
    }

    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return "";
        }

        return parsed.toString();
    } catch {
        return "";
    }
};

export function HomePage() {
    const router = useRouter();

    const [titles, setTitles] = useState<RavenTitleCardEntry[] | null>(null);
    const [authPermissions, setAuthPermissions] = useState<string[] | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [libraryError, setLibraryError] = useState<string | null>(null);
    const [discordInviteUrl, setDiscordInviteUrl] = useState<string>(moonSite.discordUrl);
    const [openingKavita, setOpeningKavita] = useState(false);
    const [kavitaLaunchError, setKavitaLaunchError] = useState<string | null>(null);

    const titleCards = useMemo(() => (Array.isArray(titles) ? titles.slice(0, 6) : []), [titles]);
    const canAccessLibrary = hasMoonPermission(authPermissions, "library_management");
    const canAccessMyRequests = hasMoonPermission(authPermissions, "myRecommendations");

    const loadLatestTitles = async () => {
        setLibraryError(null);
        setTitles(null);

        try {
            const res = await fetch("/api/noona/raven/library/latest", {cache: "no-store"});
            const json = (await res.json().catch(() => null)) as unknown;
            if (!res.ok) {
                const errorMessage =
                    json && typeof json === "object" && "error" in json && typeof (json as {
                        error?: unknown
                    }).error === "string"
                        ? String((json as { error?: unknown }).error)
                        : `Failed to load latest titles (HTTP ${res.status}).`;
                throw new Error(errorMessage);
            }

            if (Array.isArray(json)) {
                setTitles(json as RavenTitleCardEntry[]);
                return;
            }

            setTitles([]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setLibraryError(message);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const loadAuth = async () => {
            try {
                const res = await fetch("/api/noona/auth/status", {cache: "no-store"});
                const json = (await res.json().catch(() => null)) as AuthStatusResponse | null;
                if (cancelled) return;

                setAuthPermissions(res.ok ? (json?.user?.permissions ?? null) : []);
            } catch {
                if (!cancelled) {
                    setAuthPermissions([]);
                }
            } finally {
                if (!cancelled) {
                    setAuthReady(true);
                }
            }
        };

        void loadAuth();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!authReady) {
            return;
        }

        void loadLatestTitles();
    }, [authReady]);

    useEffect(() => {
        if (!authReady) {
            return;
        }

        let cancelled = false;

        const loadDiscordInvite = async () => {
            try {
                const response = await fetch("/api/noona/discord/invite", {cache: "no-store"});
                const payload = (await response.json().catch(() => null)) as DiscordInviteResponse | null;
                if (cancelled || !response.ok) {
                    return;
                }

                const nextInviteUrl = normalizeAbsoluteHttpUrl(payload?.inviteUrl);
                if (nextInviteUrl) {
                    setDiscordInviteUrl(nextInviteUrl);
                }
            } catch {
                // Keep the static Noona invite fallback when the signed-in lookup fails.
            }
        };

        void loadDiscordInvite();
        return () => {
            cancelled = true;
        };
    }, [authReady]);

    const openKavita = async () => {
        setOpeningKavita(true);
        setKavitaLaunchError(null);

        try {
            const baseUrl = await resolveKavitaBaseUrl();
            if (!baseUrl) {
                throw new Error("Kavita isn't available right now. Try again in a moment.");
            }

            window.location.assign(baseUrl);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setKavitaLaunchError(message);
            setOpeningKavita(false);
        }
    };

    return (
        <SetupModeGate>
            <AuthGate>
                <Flex
                    fillWidth
                    style={{
                        position: "relative",
                    }}
                >
                    <Column
                        fillWidth
                        horizontal="center"
                        gap="24"
                        paddingY="24"
                        paddingX="16"
                        style={{
                            maxWidth: "var(--moon-page-max-width, 116rem)",
                            position: "relative",
                            zIndex: 1,
                        }}
                        m={{style: {paddingInline: "24px"}}}
                    >
                        <Card
                            fillWidth
                            background="surface"
                            border="neutral-alpha-medium"
                            padding="0"
                            radius="xl"
                            style={{
                                position: "relative",
                                overflow: "hidden",
                                minHeight: "19rem",
                            }}
                        >
                            <Row
                                fillWidth
                                gap="0"
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(0, 1.35fr) minmax(20rem, 0.95fr)",
                                    minHeight: "19rem",
                                }}
                                s={{style: {gridTemplateColumns: "1fr"}}}
                            >
                                <Column
                                    gap="20"
                                    padding="xl"
                                    style={{
                                        position: "relative",
                                        zIndex: 1,
                                        minHeight: "19rem",
                                        justifyContent: "space-between",
                                    }}
                                    s={{style: {padding: "24px"}}}
                                >
                                    <Column gap="12" style={{maxWidth: "42rem"}}>
                                        <Text variant="label-default-s" onBackground="brand-weak">
                                            Reading, requests, and community
                                        </Text>
                                        <Heading variant="display-strong-s" wrap="balance">
                                            Welcome to Noona Dashboard.
                                        </Heading>
                                        <Text onBackground="neutral-weak" variant="body-default-m" wrap="balance">
                                            Start reading, chat with fellow readers or get support, and use Discord
                                            when you want to request something new.
                                        </Text>
                                        {canAccessMyRequests && (
                                            <Text onBackground="neutral-weak" variant="body-default-s" wrap="balance">
                                                To follow up on a request, open My requests.
                                            </Text>
                                        )}
                                    </Column>

                                    <Row gap="12" style={{flexWrap: "wrap"}}>
                                        <Button variant="primary" disabled={openingKavita}
                                                onClick={() => void openKavita()}>
                                            {openingKavita ? "Opening..." : "Start Reading"}
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onClick={() => window.open(discordInviteUrl, "_blank", "noopener,noreferrer")}
                                        >
                                            Chat with fellow readers or get support
                                        </Button>
                                        {canAccessMyRequests && (
                                            <Button variant="secondary"
                                                    onClick={() => router.push("/myrecommendations")}>
                                                My requests
                                            </Button>
                                        )}
                                    </Row>
                                    {kavitaLaunchError && (
                                        <Text onBackground="warning-strong" variant="body-default-xs">
                                            {kavitaLaunchError}
                                        </Text>
                                    )}
                                </Column>

                                <Column
                                    gap="16"
                                    padding="xl"
                                    style={{
                                        minHeight: "19rem",
                                        borderLeft: "1px solid var(--neutral-alpha-weak)",
                                        background:
                                            "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(97, 218, 251, 0.08) 100%)",
                                        justifyContent: "center",
                                    }}
                                    s={{
                                        style: {
                                            padding: "24px",
                                            borderLeft: "none",
                                            borderTop: "1px solid var(--neutral-alpha-weak)",
                                        },
                                    }}
                                >
                                    <Column gap="8">
                                        <Text variant="label-default-s" onBackground="brand-weak">
                                            Have a request? Try using Discord.
                                        </Text>
                                        <Text onBackground="neutral-weak" variant="body-default-s" wrap="balance">
                                            Ask for a title in Discord, then check My requests here for updates.
                                        </Text>
                                    </Column>

                                    <Card
                                        fillWidth
                                        background="neutral-alpha-weak"
                                        border="neutral-alpha-medium"
                                        padding="l"
                                        radius="l"
                                    >
                                        <Column gap="12">
                                            <Text onBackground="neutral-weak" variant="body-default-xs">
                                                Example Discord command
                                            </Text>
                                            <Row gap="8" vertical="center" style={{flexWrap: "wrap"}}>
                                                <Text variant="heading-default-s">
                                                    /recommend
                                                </Text>
                                                <Text
                                                    variant="label-default-s"
                                                    style={{
                                                        padding: "0.25rem 0.5rem",
                                                        borderRadius: "999px",
                                                        border: "1px solid var(--neutral-alpha-medium)",
                                                    }}
                                                >
                                                    title
                                                </Text>
                                                <Text variant="body-default-s">Naruto</Text>
                                            </Row>
                                            <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                                                Use the title name you want Noona to look up before saving the request.
                                            </Text>
                                        </Column>
                                    </Card>
                                </Column>
                            </Row>
                        </Card>

                        {libraryError && (
                            <Card fillWidth background="surface" border="danger-alpha-weak" padding="l" radius="l">
                                <Column gap="8">
                                    <Heading as="h2" variant="heading-strong-l">
                                        Recent titles unavailable
                                    </Heading>
                                    <Text>{libraryError}</Text>
                                    <Text onBackground="neutral-weak" variant="body-default-xs">
                                        Try again in a bit or ask an admin to check the library connection.
                                    </Text>
                                </Column>
                            </Card>
                        )}

                        {authReady && !titles && !libraryError && (
                            <Row fillWidth horizontal="center" paddingY="64">
                                <Spinner/>
                            </Row>
                        )}

                        {titles && (
                            <Column fillWidth gap="16">
                                <Heading as="h2" variant="heading-strong-l">
                                    Recent titles
                                </Heading>
                                {!canAccessLibrary && (
                                    <Text onBackground="neutral-weak">
                                        You can see recent titles here, but opening full title pages still requires
                                        library access.
                                    </Text>
                                )}

                                {titleCards.length === 0 ? (
                                    <Card fillWidth background="surface" border="neutral-alpha-weak" padding="l"
                                          radius="l">
                                        <Column gap="8">
                                            <Text>No recent titles yet.</Text>
                                            <Text onBackground="neutral-weak" variant="body-default-xs">
                                                Titles you add will show up here once your library has something to
                                                browse.
                                            </Text>
                                        </Column>
                                    </Card>
                                ) : (
                                    <Row
                                        fillWidth
                                        gap="16"
                                        style={{
                                            display: "grid",
                                            rowGap: "20px",
                                            gridTemplateColumns: `repeat(auto-fill, minmax(${RAVEN_TITLE_CARD_WIDTH}px, ${RAVEN_TITLE_CARD_WIDTH}px))`,
                                            justifyContent: "center",
                                        }}
                                        s={{style: {gridTemplateColumns: "1fr", justifyContent: "stretch"}}}
                                    >
                                        {titleCards.map((entry) => (
                                            <RavenTitleCard
                                                key={entry.uuid || entry.title || entry.titleName || "title"}
                                                entry={entry}
                                                clickable={canAccessLibrary}
                                            />
                                        ))}
                                    </Row>
                                )}
                            </Column>
                        )}
                    </Column>
                </Flex>
            </AuthGate>
        </SetupModeGate>
    );
}
