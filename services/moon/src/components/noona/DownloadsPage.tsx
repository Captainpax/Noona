"use client";

import {type ComponentProps, startTransition, useEffect, useEffectEvent, useMemo, useRef, useState,} from "react";
import {
    Badge,
    Button,
    Card,
    Carousel,
    Column,
    Heading,
    HoverCard,
    ProgressBar,
    RevealFx,
    Row,
    Spinner,
    Text,
} from "@once-ui-system/core";
import {AuthGate} from "./AuthGate";
import {
    countResumableHistoryTasks,
    describeTaskStatus,
    formatTaskListPreview,
    parseErrorMessage,
    resolveActiveTaskViews,
    selectCarouselTaskViews,
} from "./downloadsPageUtils.mjs";
import {SetupModeGate} from "./SetupModeGate";
import styles from "./DownloadsPage.module.scss";

type RavenDownloadProgress = {
    taskId?: string | null;
    taskType?: string | null;
    title?: string | null;
    titleUuid?: string | null;
    queuedAt?: number | null;
    totalChapters?: number | null;
    completedChapters?: number | null;
    currentChapter?: string | null;
    status?: string | null;
    latestChapter?: string | null;
    message?: string | null;
    startedAt?: number | null;
    completedAt?: number | null;
    errorMessage?: string | null;
    recoveredFromCache?: boolean | null;
    recoveryState?: string | null;
    queuedChapterNumbers?: string[] | null;
    completedChapterNumbers?: string[] | null;
    remainingChapterNumbers?: string[] | null;
    newChapterNumbers?: string[] | null;
    missingChapterNumbers?: string[] | null;
    workerIndex?: number | null;
    cpuCoreId?: number | null;
    executionMode?: string | null;
    pauseRequested?: boolean | null;
    lastUpdated?: number | null;
};

type RavenVpnRuntimeStatus = {
    enabled?: boolean;
    connected?: boolean;
    region?: string | null;
    lastError?: string | null;
    connectionState?: string | null;
};

type RavenDownloadSummary = {
    vpn?: RavenVpnRuntimeStatus | null;
};

type RavenActionResponse = {
    message?: string | null;
    affectedTasks?: number | null;
    resumedTasks?: string[] | null;
};

type ResolvedTaskView = {
    key: string;
    titleName: string;
    statusRaw: string;
    status: string;
    taskType: string;
    current: string;
    latestChapter: string;
    message: string;
    errorMessage: string;
    total: number;
    completed: number;
    percent: number;
    progressValue: number;
    queued: string[];
    remaining: string[];
    newChapters: string[];
    missingChapters: string[];
    completedChapterNumbers: string[];
    recovered: boolean;
    recoveryState: string;
    workerIndex: number | null;
    cpuCoreId: number | null;
    executionMode: string;
    pauseRequested: boolean;
    queuedAtLabel: string;
    updatedAtLabel: string;
    completedAtLabel: string;
};

type TaskStatusDetails = {
    text: string;
    tone: "neutral-weak" | "danger-strong";
};

const DOWNLOADS_POLL_MS = 1500;
const SUMMARY_POLL_MS = 3000;
const HISTORY_POLL_MS = 6000;
const DOWNLOAD_LIST_LIMIT_OPTIONS = [10, 25, 50, 100] as const;

type BadgeBackground = NonNullable<ComponentProps<typeof Badge>["background"]>;
type ProgressTone = NonNullable<ComponentProps<typeof ProgressBar>["barBackground"]>;

const normalizeString = (value: unknown): string => (typeof value === "string" ? value : "");

const statusBadgeBackground = (statusRaw: string): BadgeBackground => {
    const status = statusRaw.trim().toLowerCase();
    if (status === "completed") return "success-alpha-weak";
    if (status === "failed" || status === "interrupted") return "danger-alpha-weak";
    if (status === "paused") return "warning-alpha-weak";
    if (status === "recovering" || status === "downloading") return "brand-alpha-weak";
    return "neutral-alpha-weak";
};

const progressBarTone = (statusRaw: string): ProgressTone => {
    const status = statusRaw.trim().toLowerCase();
    if (status === "completed") return "success-strong";
    if (status === "failed" || status === "interrupted") return "danger-strong";
    if (status === "paused") return "warning-strong";
    if (status === "queued") return "neutral-strong";
    return "brand-strong";
};

function DownloadTaskBadges({task}: { task: ResolvedTaskView }) {
    return (
        <Row gap="8" style={{flexWrap: "wrap"}}>
            <Badge background="neutral-alpha-weak">
                {task.completed}/{task.total || "?"} chapters
            </Badge>
            <Badge background="neutral-alpha-weak">
                remaining {task.remaining.length}
            </Badge>
            <Badge background="neutral-alpha-weak">
                {task.taskType || "download"}
            </Badge>
            {task.recovered && (
                <Badge background="brand-alpha-weak">
                    recovered
                </Badge>
            )}
            {task.pauseRequested && (
                <Badge background="warning-alpha-weak">
                    pause queued
                </Badge>
            )}
        </Row>
    );
}

function DownloadHoverDetails({
                                  task,
                                  statusDetails,
                              }: {
    task: ResolvedTaskView;
    statusDetails: TaskStatusDetails;
}) {
    return (
        <Card
            background="surface"
            border="neutral-alpha-weak"
            padding="m"
            radius="l"
            className={styles.detailsCard}
        >
            <Column gap={10}>
                <Column gap="4">
                    <Text variant="body-strong-s" wrap="balance">
                        {task.titleName}
                    </Text>
                    <Text onBackground={statusDetails.tone} variant="body-default-xs" wrap="balance">
                        {statusDetails.text}
                    </Text>
                </Column>

                <Row gap="8" style={{flexWrap: "wrap"}}>
                    <Badge background={statusBadgeBackground(task.statusRaw)}>
                        {task.statusRaw}
                    </Badge>
                    {task.workerIndex != null && (
                        <Badge background="neutral-alpha-weak">
                            worker {task.workerIndex + 1}
                        </Badge>
                    )}
                    {task.cpuCoreId != null && (
                        <Badge background="neutral-alpha-weak">
                            CPU {task.cpuCoreId >= 0 ? task.cpuCoreId : "auto"}
                        </Badge>
                    )}
                    <Badge background="neutral-alpha-weak">
                        {task.executionMode}
                    </Badge>
                </Row>

                <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                    Queued: {task.queuedAtLabel || "n/a"}
                </Text>
                <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                    Updated: {task.updatedAtLabel || "n/a"}
                </Text>

                {task.completedAtLabel && (
                    <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                        Completed: {task.completedAtLabel}
                    </Text>
                )}

                {task.latestChapter && (
                    <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                        Latest chapter: {task.latestChapter}
                    </Text>
                )}

                {task.remaining.length > 0 && (
                    <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                        Next up: {formatTaskListPreview(task.remaining, 8)}
                    </Text>
                )}

                {task.completedChapterNumbers.length > 0 && (
                    <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                        Completed: {formatTaskListPreview(task.completedChapterNumbers, 8)}
                    </Text>
                )}

                {task.recoveryState && (
                    <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                        Recovery: {task.recoveryState}
                    </Text>
                )}

                {task.errorMessage && (
                    <Text onBackground="danger-strong" variant="body-default-xs" wrap="balance">
                        {task.errorMessage}
                    </Text>
                )}
            </Column>
        </Card>
    );
}

function DownloadsCarouselSlide({
                                    task,
                                    statusDetails,
                                }: {
    task: ResolvedTaskView;
    statusDetails: TaskStatusDetails;
}) {
    return (
        <Card
            fillWidth
            background="surface"
            border="neutral-alpha-weak"
            padding="l"
            radius="l"
            className={styles.carouselSlideCard}
        >
            <Column gap={14}>
                <Row horizontal="between" vertical="start" gap="12" s={{direction: "column"}}>
                    <Column gap={6} style={{minWidth: 0}}>
                        <Text variant="label-default-s" onBackground="neutral-weak">
                            Active spotlight
                        </Text>
                        <Heading as="h3" variant="heading-strong-l" wrap="balance">
                            {task.titleName}
                        </Heading>
                    </Column>
                    <Badge background={statusBadgeBackground(task.statusRaw)}>
                        {task.statusRaw}
                    </Badge>
                </Row>

                <Text onBackground={statusDetails.tone} variant="body-default-s" wrap="balance">
                    {statusDetails.text}
                </Text>

                <DownloadTaskBadges task={task}/>

                <ProgressBar
                    fillWidth
                    value={task.progressValue}
                    label={false}
                    barBackground={progressBarTone(task.statusRaw)}
                    className={styles.progressBarLarge}
                />
            </Column>
        </Card>
    );
}

function ActiveDownloadRow({
                               task,
                               statusDetails,
                               revealedByDefault,
                               delay,
                           }: {
    task: ResolvedTaskView;
    statusDetails: TaskStatusDetails;
    revealedByDefault: boolean;
    delay: number;
}) {
    return (
        <RevealFx
            fillWidth
            speed="fast"
            delay={delay}
            translateY={8}
            revealedByDefault={revealedByDefault}
        >
            <Card
                fillWidth
                background="surface"
                border="neutral-alpha-weak"
                padding="m"
                radius="l"
                className={styles.downloadRow}
            >
                <Column gap="12">
                    <Row horizontal="between" vertical="start" gap="12" s={{direction: "column"}}>
                        <Column gap={6} style={{minWidth: 0}}>
                            <Text variant="body-strong-s" wrap="balance">
                                {task.titleName}
                            </Text>
                            <Text onBackground={statusDetails.tone} variant="body-default-xs" wrap="balance">
                                {statusDetails.text}
                            </Text>
                        </Column>
                        <Row gap="8" style={{flexWrap: "wrap"}}>
                            <Badge background={statusBadgeBackground(task.statusRaw)}>
                                {task.statusRaw}
                            </Badge>
                            <HoverCard
                                trigger={(
                                    <Button variant="tertiary" size="s">
                                        Details
                                    </Button>
                                )}
                                placement="top-end"
                                offsetDistance="6"
                            >
                                <DownloadHoverDetails task={task} statusDetails={statusDetails}/>
                            </HoverCard>
                        </Row>
                    </Row>

                    <DownloadTaskBadges task={task}/>

                    <ProgressBar
                        fillWidth
                        value={task.progressValue}
                        label={false}
                        barBackground={progressBarTone(task.statusRaw)}
                        className={styles.progressBarCompact}
                    />
                </Column>
            </Card>
        </RevealFx>
    );
}

export function DownloadsPage() {
    const [downloads, setDownloads] = useState<RavenDownloadProgress[] | null>(null);
    const [downloadsError, setDownloadsError] = useState<string | null>(null);
    const [vpnStatus, setVpnStatus] = useState<RavenVpnRuntimeStatus | null>(null);
    const [listLimit, setListLimit] = useState<number>(25);

    const [historyLoading, setHistoryLoading] = useState(false);
    const [history, setHistory] = useState<RavenDownloadProgress[]>([]);

    const [resumingDownloads, setResumingDownloads] = useState(false);
    const [pausingDownloads, setPausingDownloads] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const revealedTaskKeysRef = useRef<Set<string>>(new Set());

    const pollDownloads = async () => {
        try {
            const res = await fetch("/api/noona/raven/downloads/status", {cache: "no-store"});
            const json = (await res.json().catch(() => null)) as unknown;

            if (!res.ok) {
                throw new Error(parseErrorMessage(json, `Failed to load downloads (HTTP ${res.status}).`));
            }

            startTransition(() => {
                setDownloads(Array.isArray(json) ? json as RavenDownloadProgress[] : []);
                setDownloadsError(null);
            });
        } catch (error_) {
            const message = error_ instanceof Error ? error_.message : String(error_);
            setDownloadsError(message);
        }
    };

    const loadSummary = async () => {
        try {
            const res = await fetch("/api/noona/raven/downloads/summary", {cache: "no-store"});
            const json = (await res.json().catch(() => null)) as RavenDownloadSummary | null;
            if (!res.ok) {
                return;
            }

            startTransition(() => {
                setVpnStatus(json?.vpn ?? null);
            });
        } catch {
            // Keep the last good VPN snapshot if summary reads fail.
        }
    };

    const loadHistory = async ({quiet = false}: { quiet?: boolean } = {}) => {
        if (!quiet) {
            setHistoryLoading(true);
        }

        try {
            const res = await fetch("/api/noona/raven/downloads/history", {cache: "no-store"});
            const json = await res.json().catch(() => null);
            if (!res.ok) {
                return;
            }

            startTransition(() => {
                setHistory(Array.isArray(json) ? json as RavenDownloadProgress[] : []);
            });
        } catch {
            // Resume gating can fall back to the last known history snapshot.
        } finally {
            if (!quiet) {
                setHistoryLoading(false);
            }
        }
    };

    const refreshAll = async () => {
        await Promise.all([pollDownloads(), loadSummary(), loadHistory()]);
    };

    const refreshAllOnMount = useEffectEvent(() => {
        void refreshAll();
    });

    const pollSummaryInBackground = useEffectEvent(() => {
        void loadSummary();
    });

    const pollHistoryInBackground = useEffectEvent(() => {
        void loadHistory({quiet: true});
    });

    useEffect(() => {
        const downloadsInterval = window.setInterval(() => {
            void pollDownloads();
        }, DOWNLOADS_POLL_MS);
        const summaryInterval = window.setInterval(() => {
            pollSummaryInBackground();
        }, SUMMARY_POLL_MS);
        const historyInterval = window.setInterval(() => {
            pollHistoryInBackground();
        }, HISTORY_POLL_MS);

        refreshAllOnMount();

        return () => {
            window.clearInterval(downloadsInterval);
            window.clearInterval(summaryInterval);
            window.clearInterval(historyInterval);
        };
    }, []);

    const requestResumeDownloads = async () => {
        setResumingDownloads(true);
        setActionMessage(null);
        setActionError(null);

        try {
            const res = await fetch("/api/noona/raven/downloads/resume", {
                method: "POST",
            });
            const json = (await res.json().catch(() => null)) as RavenActionResponse | null;
            if (!res.ok) {
                throw new Error(parseErrorMessage(json, `Resume failed (HTTP ${res.status}).`));
            }

            const resumedTasks = Array.isArray(json?.resumedTasks) ? json.resumedTasks.length : 0;
            const fallbackMessage = resumedTasks > 0
                ? `Resume request accepted for ${resumedTasks} task(s).`
                : "Resume request sent to Raven.";
            setActionMessage(normalizeString(json?.message).trim() || fallbackMessage);
            await refreshAll();
        } catch (error_) {
            const message = error_ instanceof Error ? error_.message : String(error_);
            setActionError(message);
        } finally {
            setResumingDownloads(false);
        }
    };

    const requestPauseDownloads = async () => {
        setPausingDownloads(true);
        setActionMessage(null);
        setActionError(null);

        try {
            const res = await fetch("/api/noona/raven/downloads/pause", {
                method: "POST",
            });
            const json = (await res.json().catch(() => null)) as RavenActionResponse | null;
            if (!res.ok) {
                throw new Error(parseErrorMessage(json, `Pause failed (HTTP ${res.status}).`));
            }

            const affectedTasks = typeof json?.affectedTasks === "number" && Number.isFinite(json.affectedTasks)
                ? json.affectedTasks
                : null;
            const fallbackMessage = affectedTasks != null && affectedTasks > 0
                ? `Pause request accepted for ${affectedTasks} task(s). Raven will stop after the current chapter.`
                : "No active Raven downloads were available to pause.";
            setActionMessage(normalizeString(json?.message).trim() || fallbackMessage);
            await refreshAll();
        } catch (error_) {
            const message = error_ instanceof Error ? error_.message : String(error_);
            setActionError(message);
        } finally {
            setPausingDownloads(false);
        }
    };

    const activeTaskViews = useMemo(
        () => resolveActiveTaskViews(downloads ?? []) as ResolvedTaskView[],
        [downloads],
    );
    const carouselTaskViews = useMemo(
        () => selectCarouselTaskViews(activeTaskViews) as ResolvedTaskView[],
        [activeTaskViews],
    );
    const displayedTaskViews = useMemo(
        () => activeTaskViews.slice(0, listLimit),
        [activeTaskViews, listLimit],
    );
    const resumableTaskCount = useMemo(() => countResumableHistoryTasks(history), [history]);
    const canResumeDownloads = resumableTaskCount > 0;

    useEffect(() => {
        for (const task of activeTaskViews) {
            revealedTaskKeysRef.current.add(task.key);
        }
    }, [activeTaskViews]);

    const carouselItems = useMemo(
        () =>
            carouselTaskViews.map((task) => ({
                slide: (
                    <DownloadsCarouselSlide
                        task={task}
                        statusDetails={describeTaskStatus(task, vpnStatus) as TaskStatusDetails}
                    />
                ),
                alt: task.titleName,
            })),
        [carouselTaskViews, vpnStatus],
    );

    const downloadsUnavailable = downloads == null && Boolean(downloadsError);
    const downloadsLoading = downloads == null && !downloadsError;

    return (
        <SetupModeGate>
            <AuthGate
                requiredPermission="download_management"
                deniedMessage="Downloads access requires Download management permission."
            >
                <Column
                    fillWidth
                    horizontal="center"
                    gap="16"
                    paddingY="24"
                    paddingX="16"
                    style={{maxWidth: "var(--moon-page-max-width, 116rem)"}}
                    className={styles.pageShell}
                    m={{style: {paddingInline: "24px"}}}
                >
                    <Card
                        fillWidth
                        background="surface"
                        border="neutral-alpha-weak"
                        padding="l"
                        radius="xl"
                        className={styles.sectionCard}
                    >
                        <Column gap="12">
                            <Row fillWidth horizontal="between" vertical="center" gap="12" s={{direction: "column"}}>
                                <Column gap="4" style={{minWidth: 0}}>
                                    <Heading variant="display-strong-s" wrap="balance">
                                        Downloads
                                    </Heading>
                                    <Text onBackground="neutral-weak" wrap="balance">
                                        Active-first queue view with a live carousel, progress bars, and hover details
                                        for the current jobs.
                                    </Text>
                                </Column>

                                <Row gap="8" style={{flexWrap: "wrap"}}>
                                    <Badge background="neutral-alpha-weak">
                                        {activeTaskViews.length} active
                                    </Badge>
                                    <Button variant="primary" href="/downloads/add">
                                        Add download
                                    </Button>
                                    <Button variant="secondary" onClick={() => void refreshAll()}>
                                        Refresh
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        disabled={pausingDownloads || activeTaskViews.length === 0}
                                        onClick={() => void requestPauseDownloads()}
                                    >
                                        {pausingDownloads ? "Pausing..." : "Pause"}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        disabled={resumingDownloads || historyLoading || !canResumeDownloads}
                                        onClick={() => void requestResumeDownloads()}
                                    >
                                        {resumingDownloads ? "Resuming..." : "Resume"}
                                    </Button>
                                </Row>
                            </Row>

                            {actionError && (
                                <Text onBackground="danger-strong" variant="body-default-xs" wrap="balance">
                                    {actionError}
                                </Text>
                            )}
                            {downloadsError && (
                                <Text onBackground="danger-strong" variant="body-default-xs" wrap="balance">
                                    {downloadsError}
                                </Text>
                            )}
                            {actionMessage && !actionError && (
                                <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                                    {actionMessage}
                                </Text>
                            )}
                        </Column>
                    </Card>

                    <Card
                        fillWidth
                        background="surface"
                        border="neutral-alpha-weak"
                        padding="l"
                        radius="xl"
                        className={styles.sectionCard}
                    >
                        <Column gap="12">
                            <Column gap="4">
                                <Text variant="label-default-s" onBackground="neutral-weak">
                                    Carousel
                                </Text>
                                <Heading as="h2" variant="heading-strong-l">
                                    First 10 active downloads
                                </Heading>
                            </Column>

                            {downloadsLoading && (
                                <Row fillWidth horizontal="center" paddingY="16">
                                    <Spinner/>
                                </Row>
                            )}

                            {downloadsUnavailable && (
                                <Text onBackground="neutral-weak" variant="body-default-s" wrap="balance">
                                    The active downloads carousel is unavailable while Moon reconnects to Raven.
                                </Text>
                            )}

                            {!downloadsLoading && !downloadsUnavailable && carouselItems.length === 0 && (
                                <Card
                                    fillWidth
                                    background="surface"
                                    border="neutral-alpha-weak"
                                    padding="l"
                                    radius="l"
                                    className={styles.emptyStateCard}
                                >
                                    <Column gap="8">
                                        <Heading as="h3" variant="heading-strong-m">
                                            No active downloads
                                        </Heading>
                                        <Text onBackground="neutral-weak" wrap="balance">
                                            Raven is idle right now. Add a title and the carousel will start tracking
                                            the live queue automatically.
                                        </Text>
                                    </Column>
                                </Card>
                            )}

                            {!downloadsLoading && !downloadsUnavailable && carouselItems.length > 0 && (
                                <Carousel
                                    items={carouselItems}
                                    indicator="line"
                                    controls
                                    fillWidth
                                    revealedByDefault
                                    className={styles.downloadsCarousel}
                                    play={{auto: true, controls: true, progress: true, interval: 4500}}
                                />
                            )}
                        </Column>
                    </Card>

                    <Card
                        fillWidth
                        background="surface"
                        border="neutral-alpha-weak"
                        padding="l"
                        radius="xl"
                        className={styles.sectionCard}
                    >
                        <Column gap="12">
                            <Row fillWidth horizontal="between" vertical="center" gap="12" s={{direction: "column"}}>
                                <Column gap="4">
                                    <Text variant="label-default-s" onBackground="neutral-weak">
                                        Active list
                                    </Text>
                                    <Heading as="h2" variant="heading-strong-l">
                                        Live queue
                                    </Heading>
                                </Column>
                                <Row gap={10} vertical="center" style={{flexWrap: "wrap"}}>
                                    <Text onBackground="neutral-weak" variant="body-default-xs">
                                        Showing {Math.min(activeTaskViews.length, listLimit)} of {activeTaskViews.length}
                                    </Text>
                                    <label className={styles.listLimitControl}>
                                        <span className={styles.listLimitLabel}>Load</span>
                                        <select
                                            aria-label="Choose how many active downloads to load in the list"
                                            className={styles.listLimitSelect}
                                            value={String(listLimit)}
                                            onChange={(event) => {
                                                setListLimit(Number.parseInt(event.target.value, 10) || 25);
                                            }}
                                        >
                                            {DOWNLOAD_LIST_LIMIT_OPTIONS.map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </Row>
                            </Row>

                            {downloadsLoading && (
                                <Text onBackground="neutral-weak" variant="body-default-s">
                                    Loading active downloads...
                                </Text>
                            )}

                            {downloadsUnavailable && (
                                <Text onBackground="neutral-weak" variant="body-default-s" wrap="balance">
                                    Active downloads could not be loaded. Retry refresh when Raven is reachable again.
                                </Text>
                            )}

                            {!downloadsLoading && !downloadsUnavailable && activeTaskViews.length === 0 && (
                                <Text onBackground="neutral-weak" variant="body-default-s" wrap="balance">
                                    No active downloads.
                                </Text>
                            )}

                            {!downloadsLoading && !downloadsUnavailable && activeTaskViews.length > 0 && (
                                <Column gap={10} className={styles.downloadsList}>
                                    {displayedTaskViews.map((task, index) => (
                                        <ActiveDownloadRow
                                            key={task.key}
                                            task={task}
                                            statusDetails={describeTaskStatus(task, vpnStatus) as TaskStatusDetails}
                                            revealedByDefault={revealedTaskKeysRef.current.has(task.key)}
                                            delay={Math.min(index * 45, 180)}
                                        />
                                    ))}
                                </Column>
                            )}
                        </Column>
                    </Card>
                </Column>
            </AuthGate>
        </SetupModeGate>
    );
}
