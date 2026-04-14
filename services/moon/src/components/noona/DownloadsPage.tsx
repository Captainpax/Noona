"use client";

import {type ComponentProps, startTransition, useEffect, useEffectEvent, useMemo, useState,} from "react";
import {Badge, Button, Card, Column, Heading, HoverCard, ProgressBar, Row, Spinner, Text,} from "@once-ui-system/core";
import {AuthGate} from "./AuthGate";
import {DownloadsCarousel} from "./DownloadsCarousel";
import {SetupModeGate} from "./SetupModeGate";
import type {
    DownloadBucketFilter,
    DownloadSortKey,
    DownloadStatusFilter,
    RavenVpnRuntimeStatus,
    ResolvedTaskView,
    SortDirection,
} from "./downloadsTypes";
import {
    countResumableHistoryTasks,
    describeTaskStatus,
    describeTaskTime,
    filterTaskViews,
    formatTaskListPreview,
    getTaskProgressTone,
    getTaskStatusBadgeBackground,
    parseErrorMessage,
    resolveCombinedTaskViews,
    selectCarouselTaskViews,
    sortTaskViews,
} from "./downloadsPageUtils.mjs";
import styles from "./DownloadsPage.module.scss";

type RavenDownloadProgress = {
    taskId?: string | null;
    taskType?: string | null;
    coverUrl?: string | null;
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
    pauseRequested?: boolean | null;
    lastUpdated?: number | null;
};

type RavenDownloadSummary = {
    vpn?: RavenVpnRuntimeStatus | null;
};

type RavenActionResponse = {
    message?: string | null;
    affectedTasks?: number | null;
    resumedTasks?: string[] | null;
};

type TaskStatusDetails = {
    text: string;
    tone: "neutral-weak" | "danger-strong";
};

const DOWNLOADS_POLL_MS = 1500;
const SUMMARY_POLL_MS = 3000;
const HISTORY_POLL_MS = 6000;
const DOWNLOADS_CAROUSEL_INTERVAL_MS = 4500;

const BUCKET_FILTERS: { value: DownloadBucketFilter; label: string }[] = [
    {value: "all", label: "All"},
    {value: "active", label: "Active"},
    {value: "recentHistory", label: "Last 24h"},
];

const STATUS_FILTERS: { value: DownloadStatusFilter; label: string }[] = [
    {value: "all", label: "All"},
    {value: "downloading", label: "Downloading"},
    {value: "queued", label: "Queued"},
    {value: "recovering", label: "Recovering"},
    {value: "needsAttention", label: "Needs attention"},
];

const SORT_OPTIONS: { value: DownloadSortKey; label: string }[] = [
    {value: "newest", label: "Newest"},
    {value: "status", label: "Status"},
    {value: "progress", label: "Progress"},
    {value: "title", label: "Title"},
];

type BadgeBackground = NonNullable<ComponentProps<typeof Badge>["background"]>;
type ProgressTone = NonNullable<ComponentProps<typeof ProgressBar>["barBackground"]>;

const normalizeString = (value: unknown): string => (typeof value === "string" ? value : "");

const progressSummary = (task: ResolvedTaskView) => `${task.completed}/${task.total || "?"} chapters`;

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
                    <Badge background={getTaskStatusBadgeBackground(task.statusRaw) as BadgeBackground}>
                        {task.statusRaw}
                    </Badge>
                    <Badge background="neutral-alpha-weak">
                        {task.sourceLabel}
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

function DownloadTableRow({
                              task,
                              statusDetails,
                          }: {
    task: ResolvedTaskView;
    statusDetails: TaskStatusDetails;
}) {
    return (
        <tr className={styles.tableRow}>
            <td className={styles.tableCell}>
                <Column gap={6} style={{minWidth: "14rem"}}>
                    <Text variant="body-strong-s" wrap="balance">
                        {task.titleName}
                    </Text>
                    <Row gap={6} style={{flexWrap: "wrap"}}>
                        {task.taskType && (
                            <Badge background="neutral-alpha-weak">
                                {task.taskType}
                            </Badge>
                        )}
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
                </Column>
            </td>
            <td className={styles.tableCell}>
                <Badge
                    background={(task.source === "active" ? "brand-alpha-weak" : "neutral-alpha-weak") as BadgeBackground}
                >
                    {task.sourceLabel}
                </Badge>
            </td>
            <td className={styles.tableCell}>
                <Row gap={6} style={{flexWrap: "wrap"}}>
                    <Badge background={getTaskStatusBadgeBackground(task.statusRaw) as BadgeBackground}>
                        {task.statusRaw}
                    </Badge>
                </Row>
            </td>
            <td className={styles.tableCell}>
                <Column gap="8" className={styles.progressCell}>
                    <Text onBackground="neutral-weak" variant="body-default-xs">
                        {progressSummary(task)}
                    </Text>
                    <ProgressBar
                        fillWidth
                        value={task.progressValue}
                        label={false}
                        barBackground={getTaskProgressTone(task.statusRaw) as ProgressTone}
                        className={styles.tableProgressBar}
                    />
                    <Text onBackground="neutral-weak" variant="body-default-xs">
                        {task.remaining.length} remaining
                    </Text>
                </Column>
            </td>
            <td className={styles.tableCell}>
                <Column gap={6} style={{minWidth: "16rem"}}>
                    <Text onBackground={statusDetails.tone} variant="body-default-xs" wrap="balance">
                        {statusDetails.text}
                    </Text>
                    {task.latestChapter && task.current !== task.latestChapter && (
                        <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                            Latest chapter: {task.latestChapter}
                        </Text>
                    )}
                </Column>
            </td>
            <td className={styles.tableCell}>
                <Column gap="8" style={{minWidth: "12rem"}}>
                    <Text onBackground="neutral-weak" variant="body-default-xs" wrap="balance">
                        {describeTaskTime(task)}
                    </Text>
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
                </Column>
            </td>
        </tr>
    );
}

export function DownloadsPage() {
    const [downloads, setDownloads] = useState<RavenDownloadProgress[] | null>(null);
    const [downloadsError, setDownloadsError] = useState<string | null>(null);
    const [vpnStatus, setVpnStatus] = useState<RavenVpnRuntimeStatus | null>(null);

    const [historyLoading, setHistoryLoading] = useState(false);
    const [history, setHistory] = useState<RavenDownloadProgress[]>([]);

    const [bucketFilter, setBucketFilter] = useState<DownloadBucketFilter>("all");
    const [statusFilter, setStatusFilter] = useState<DownloadStatusFilter>("all");
    const [sortKey, setSortKey] = useState<DownloadSortKey>("newest");
    const [sortDirection, setSortDirection] = useState<SortDirection>("descending");

    const [resumingDownloads, setResumingDownloads] = useState(false);
    const [pausingDownloads, setPausingDownloads] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

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

    const combinedTaskViews = useMemo(
        () => resolveCombinedTaskViews(downloads ?? [], history) as ResolvedTaskView[],
        [downloads, history],
    );
    const carouselTaskViews = useMemo(
        () => selectCarouselTaskViews(combinedTaskViews) as ResolvedTaskView[],
        [combinedTaskViews],
    );
    const filteredTaskViews = useMemo(
        () => filterTaskViews(combinedTaskViews, {bucket: bucketFilter, status: statusFilter}) as ResolvedTaskView[],
        [bucketFilter, combinedTaskViews, statusFilter],
    );
    const visibleTaskViews = useMemo(
        () => sortTaskViews(filteredTaskViews, {sortKey, direction: sortDirection}) as ResolvedTaskView[],
        [filteredTaskViews, sortDirection, sortKey],
    );
    const resumableTaskCount = useMemo(() => countResumableHistoryTasks(history), [history]);
    const canResumeDownloads = resumableTaskCount > 0;
    const activeTaskCount = useMemo(
        () => combinedTaskViews.filter((task) => task.source === "active").length,
        [combinedTaskViews],
    );
    const recentTaskCount = useMemo(
        () => combinedTaskViews.filter((task) => task.source === "recentHistory").length,
        [combinedTaskViews],
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
                                        Active downloads stay in a live poster rail while the shared table keeps the
                                        current queue and the last 24 hours together in one place.
                                    </Text>
                                </Column>

                                <Row gap="8" style={{flexWrap: "wrap"}}>
                                    <Badge background="brand-alpha-weak">
                                        {activeTaskCount} active
                                    </Badge>
                                    <Badge background="neutral-alpha-weak">
                                        {recentTaskCount} last 24h
                                    </Badge>
                                    <Button variant="primary" href="/downloads/add">
                                        Add download
                                    </Button>
                                    <Button variant="secondary" onClick={() => void refreshAll()}>
                                        Refresh
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        disabled={pausingDownloads || activeTaskCount === 0}
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
                                    Active rail
                                </Text>
                                <Heading as="h2" variant="heading-strong-l">
                                    Live download cards
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

                            {!downloadsLoading && !downloadsUnavailable && carouselTaskViews.length === 0 && (
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
                                            Raven is idle right now. Add a title and the live card rail will start
                                            tracking the queue automatically.
                                        </Text>
                                    </Column>
                                </Card>
                            )}

                            {!downloadsLoading && !downloadsUnavailable && carouselTaskViews.length > 0 && (
                                <DownloadsCarousel
                                    tasks={carouselTaskViews}
                                    intervalMs={DOWNLOADS_CAROUSEL_INTERVAL_MS}
                                    vpnStatus={vpnStatus}
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
                                        Shared table
                                    </Text>
                                    <Heading as="h2" variant="heading-strong-l">
                                        Active and last 24 hours
                                    </Heading>
                                </Column>
                                <Text onBackground="neutral-weak" variant="body-default-xs">
                                    Showing {visibleTaskViews.length} of {combinedTaskViews.length}
                                </Text>
                            </Row>

                            <Column gap={10} className={styles.toolbarStack}>
                                <Row gap="8" style={{flexWrap: "wrap"}}>
                                    <Text onBackground="neutral-weak" variant="body-default-xs"
                                          className={styles.toolbarLabel}>
                                        Bucket
                                    </Text>
                                    {BUCKET_FILTERS.map((filterOption) => (
                                        <Button
                                            key={filterOption.value}
                                            variant={bucketFilter === filterOption.value ? "primary" : "secondary"}
                                            size="s"
                                            onClick={() => setBucketFilter(filterOption.value)}
                                        >
                                            {filterOption.label}
                                        </Button>
                                    ))}
                                </Row>

                                <Row gap="8" style={{flexWrap: "wrap"}}>
                                    <Text onBackground="neutral-weak" variant="body-default-xs"
                                          className={styles.toolbarLabel}>
                                        Status
                                    </Text>
                                    {STATUS_FILTERS.map((filterOption) => (
                                        <Button
                                            key={filterOption.value}
                                            variant={statusFilter === filterOption.value ? "primary" : "secondary"}
                                            size="s"
                                            onClick={() => setStatusFilter(filterOption.value)}
                                        >
                                            {filterOption.label}
                                        </Button>
                                    ))}
                                </Row>

                                <Row gap="8" style={{flexWrap: "wrap"}}>
                                    <Text onBackground="neutral-weak" variant="body-default-xs"
                                          className={styles.toolbarLabel}>
                                        Sort
                                    </Text>
                                    {SORT_OPTIONS.map((option) => (
                                        <Button
                                            key={option.value}
                                            variant={sortKey === option.value ? "primary" : "secondary"}
                                            size="s"
                                            onClick={() => setSortKey(option.value)}
                                        >
                                            {option.label}
                                        </Button>
                                    ))}
                                    <Button
                                        variant="secondary"
                                        size="s"
                                        onClick={() => {
                                            setSortDirection((current) =>
                                                current === "ascending" ? "descending" : "ascending");
                                        }}
                                    >
                                        {sortDirection === "ascending" ? "Ascending" : "Descending"}
                                    </Button>
                                </Row>
                            </Column>

                            {downloadsLoading && combinedTaskViews.length === 0 && (
                                <Text onBackground="neutral-weak" variant="body-default-s">
                                    Loading downloads...
                                </Text>
                            )}

                            {!downloadsLoading && combinedTaskViews.length === 0 && (
                                <Text onBackground="neutral-weak" variant="body-default-s" wrap="balance">
                                    No active downloads or recent history yet.
                                </Text>
                            )}

                            {!downloadsLoading && combinedTaskViews.length > 0 && visibleTaskViews.length === 0 && (
                                <Text onBackground="neutral-weak" variant="body-default-s" wrap="balance">
                                    No downloads match the current filters.
                                </Text>
                            )}

                            {visibleTaskViews.length > 0 && (
                                <div className={styles.tableScroller}>
                                    <table className={styles.downloadsTable}>
                                        <thead>
                                        <tr>
                                            <th className={styles.tableHeaderCell}>Title</th>
                                            <th className={styles.tableHeaderCell}>Bucket</th>
                                            <th className={styles.tableHeaderCell}>Status</th>
                                            <th className={styles.tableHeaderCell}>Progress</th>
                                            <th className={styles.tableHeaderCell}>Current / detail</th>
                                            <th className={styles.tableHeaderCell}>Time</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {visibleTaskViews.map((task) => (
                                            <DownloadTableRow
                                                key={task.key}
                                                task={task}
                                                statusDetails={describeTaskStatus(task, vpnStatus) as TaskStatusDetails}
                                            />
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Column>
                    </Card>
                </Column>
            </AuthGate>
        </SetupModeGate>
    );
}
