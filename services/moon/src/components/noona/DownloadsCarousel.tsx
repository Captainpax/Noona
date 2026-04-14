"use client";

import {Column, IconButton, Row, Text} from "@once-ui-system/core";
import {useEffect, useEffectEvent, useMemo, useState} from "react";
import {DownloadsRailCard} from "./DownloadsRailCard";
import {describeCarouselTaskLine} from "./downloadsPageUtils.mjs";
import {
    createDownloadsCarouselPlayback,
    resolveDownloadsCarouselPlayback,
    resolveDownloadsCarouselWindow,
} from "./downloadsCarouselState.mjs";
import type {RavenVpnRuntimeStatus, ResolvedTaskView} from "./downloadsTypes";
import styles from "./DownloadsCarousel.module.scss";

type DownloadsCarouselProps = {
    tasks: ResolvedTaskView[];
    intervalMs?: number;
    vpnStatus?: RavenVpnRuntimeStatus | null;
};

type DownloadsCarouselAction = { type: "next" | "previous" | "restart" } | {
    type: "jump";
    index: number;
};

const DEFAULT_PLAY_INTERVAL_MS = 4500;
const EMPTY_TASK_KEY = "";

const normalizeTaskKey = (task?: ResolvedTaskView): string => task?.key ?? EMPTY_TASK_KEY;

const resolveRailVisibleCount = () => {
    if (typeof window === "undefined") {
        return 5;
    }

    if (window.innerWidth < 720) {
        return 2;
    }

    if (window.innerWidth < 1120) {
        return 3;
    }

    return 5;
};

export function DownloadsCarousel({
                                      tasks,
                                      intervalMs = DEFAULT_PLAY_INTERVAL_MS,
                                      vpnStatus = null,
                                  }: DownloadsCarouselProps) {
    const [activeTaskKey, setActiveTaskKey] = useState(() => normalizeTaskKey(tasks[0]));
    const [cycleKey, setCycleKey] = useState(() => createDownloadsCarouselPlayback().cycleKey);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isInteracting, setIsInteracting] = useState(false);
    const [visibleCount, setVisibleCount] = useState(() => resolveRailVisibleCount());

    const resolvedActiveTaskKey = useMemo(
        () => (tasks.some((task) => task.key === activeTaskKey) ? activeTaskKey : normalizeTaskKey(tasks[0])),
        [activeTaskKey, tasks],
    );

    const activeIndex = useMemo(() => {
        if (tasks.length === 0) {
            return -1;
        }

        const matchedIndex = tasks.findIndex((task) => task.key === resolvedActiveTaskKey);
        return matchedIndex >= 0 ? matchedIndex : 0;
    }, [resolvedActiveTaskKey, tasks]);

    const visibleIndices = useMemo(
        () => resolveDownloadsCarouselWindow(activeIndex, tasks.length, visibleCount),
        [activeIndex, tasks.length, visibleCount],
    );
    const visibleTasks = useMemo(
        () => visibleIndices.map((index) => tasks[index]).filter(Boolean),
        [tasks, visibleIndices],
    );

    const canAdvance = tasks.length > visibleCount;

    const applyPlaybackAction = (action: DownloadsCarouselAction) => {
        if (tasks.length === 0 || activeIndex < 0) {
            return;
        }

        const nextPlayback = resolveDownloadsCarouselPlayback({activeIndex, cycleKey}, action, tasks.length);
        const nextTask = tasks[nextPlayback.activeIndex];
        if (!nextTask) {
            return;
        }

        setActiveTaskKey(nextTask.key);
        setCycleKey(nextPlayback.cycleKey);
    };

    const advancePlayback = useEffectEvent(() => {
        applyPlaybackAction({type: "next"});
    });

    useEffect(() => {
        const handleResize = () => {
            setVisibleCount(resolveRailVisibleCount());
        };

        handleResize();
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    useEffect(() => {
        if (!isPlaying || isInteracting || !canAdvance || activeIndex < 0) {
            return;
        }

        const normalizedInterval = Math.max(1000, intervalMs);
        const advanceTimerId = window.setTimeout(() => {
            advancePlayback();
        }, normalizedInterval);

        return () => {
            window.clearTimeout(advanceTimerId);
        };
    }, [activeIndex, canAdvance, cycleKey, intervalMs, isInteracting, isPlaying]);

    if (visibleTasks.length === 0) {
        return null;
    }

    return (
        <Column
            fillWidth
            gap="12"
            className={styles.carousel}
            onMouseEnter={() => setIsInteracting(true)}
            onMouseLeave={() => setIsInteracting(false)}
            onFocusCapture={() => setIsInteracting(true)}
            onBlurCapture={(event) => {
                const currentTarget = event.currentTarget;
                window.requestAnimationFrame(() => {
                    if (!currentTarget.contains(document.activeElement)) {
                        setIsInteracting(false);
                    }
                });
            }}
        >
            <Row fillWidth horizontal="between" vertical="center" gap="12" s={{direction: "column"}}>
                <Text onBackground="neutral-weak" variant="body-default-xs">
                    {tasks.length} active download{tasks.length === 1 ? "" : "s"} in the live rail
                </Text>
                <Row gap="8" style={{flexWrap: "wrap"}}>
                    <IconButton
                        icon={isPlaying ? "pause" : "play"}
                        variant="secondary"
                        size="s"
                        onClick={() => setIsPlaying((previous) => !previous)}
                        aria-label={isPlaying ? "Pause downloads card rail autoplay" : "Resume downloads card rail autoplay"}
                    />
                    {canAdvance && (
                        <>
                            <IconButton
                                icon="chevronLeft"
                                variant="secondary"
                                size="s"
                                onClick={() => applyPlaybackAction({type: "previous"})}
                                aria-label="Show previous active download cards"
                            />
                            <IconButton
                                icon="chevronRight"
                                variant="secondary"
                                size="s"
                                onClick={() => applyPlaybackAction({type: "next"})}
                                aria-label="Show next active download cards"
                            />
                        </>
                    )}
                </Row>
            </Row>

            <div className={styles.railViewport}>
                <div className={styles.railGrid}>
                    {visibleTasks.map((task) => (
                        <div key={task.key} className={styles.railSlot}>
                            <DownloadsRailCard
                                task={task}
                                statusLine={describeCarouselTaskLine(task, vpnStatus)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </Column>
    );
}
