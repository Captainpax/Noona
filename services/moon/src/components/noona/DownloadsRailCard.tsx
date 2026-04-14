import {type ComponentProps} from "react";
import {Badge, Column, Heading, ProgressBar, Row, Text} from "@once-ui-system/core";
import {RavenPosterCardShell} from "./RavenPosterCardShell";
import type {ResolvedTaskView} from "./downloadsTypes";
import {getTaskProgressTone, getTaskStatusBadgeBackground,} from "./downloadsPageUtils.mjs";
import styles from "./DownloadsCarousel.module.scss";

type BadgeBackground = NonNullable<ComponentProps<typeof Badge>["background"]>;
type ProgressTone = NonNullable<ComponentProps<typeof ProgressBar>["barBackground"]>;

type DownloadsRailCardProps = {
    task: ResolvedTaskView;
    statusLine: string;
};

export function DownloadsRailCard({task, statusLine}: DownloadsRailCardProps) {
    return (
        <RavenPosterCardShell
            title={task.titleName}
            coverUrl={task.coverUrl}
            mediaAlt={`${task.titleName} cover`}
            clickable={false}
            topContent={(
                <>
                    <Row horizontal="between" vertical="center" gap="8" style={{flexWrap: "wrap"}}>
                        <Badge
                            background={getTaskStatusBadgeBackground(task.statusRaw) as BadgeBackground}
                            onBackground="neutral-strong"
                        >
                            {task.statusRaw}
                        </Badge>
                        <Badge background="neutral-alpha-weak" onBackground="neutral-strong">
                            {task.completed}/{task.total || "?"}
                        </Badge>
                    </Row>
                    <Heading
                        as="h3"
                        variant="heading-strong-m"
                        onBackground="neutral-strong"
                        wrap="balance"
                        style={{
                            minWidth: 0,
                            lineHeight: 1.2,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                        }}
                    >
                        {task.titleName}
                    </Heading>
                    <Text
                        onBackground="neutral-weak"
                        variant="body-default-xs"
                        style={{
                            minWidth: 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                        }}
                    >
                        {statusLine}
                    </Text>
                </>
            )}
            bottomContent={(
                <Column fillWidth gap="8" style={{width: "100%"}}>
                    <Row horizontal="between" vertical="center" gap="8" style={{flexWrap: "wrap"}}>
                        <Text onBackground="neutral-weak" variant="body-default-xs">
                            {task.taskType || "download"}
                        </Text>
                        <Text onBackground="neutral-weak" variant="body-default-xs">
                            {Math.round(task.progressValue)}%
                        </Text>
                    </Row>
                    <ProgressBar
                        fillWidth
                        value={task.progressValue}
                        label={false}
                        barBackground={getTaskProgressTone(task.statusRaw) as ProgressTone}
                        className={styles.railProgressBar}
                    />
                </Column>
            )}
        />
    );
}
