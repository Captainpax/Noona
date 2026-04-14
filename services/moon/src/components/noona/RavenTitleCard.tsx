import {Badge, Heading, Row, Text} from "@once-ui-system/core";
import {RAVEN_POSTER_CARD_HEIGHT, RAVEN_POSTER_CARD_WIDTH, RavenPosterCardShell,} from "./RavenPosterCardShell";

export type RavenTitleCardEntry = {
    title?: string | null;
    titleName?: string | null;
    uuid?: string | null;
    lastDownloaded?: string | null;
    coverUrl?: string | null;
    type?: string | null;
    chapterCount?: number | null;
    chaptersDownloaded?: number | null;
};

export const RAVEN_TITLE_CARD_WIDTH = RAVEN_POSTER_CARD_WIDTH;
export const RAVEN_TITLE_CARD_HEIGHT = RAVEN_POSTER_CARD_HEIGHT;

const normalizeString = (value: unknown): string => (typeof value === "string" ? value : "");

type RavenTitleCardProps = {
    entry: RavenTitleCardEntry;
    clickable?: boolean;
};

export function RavenTitleCard({entry, clickable = true}: RavenTitleCardProps) {
    const uuid = normalizeString(entry.uuid);
    const title = normalizeString(entry.title ?? entry.titleName).trim() || uuid || "Untitled";
    const lastDownloaded = normalizeString(entry.lastDownloaded);
    const coverUrl = normalizeString(entry.coverUrl).trim();
    const type = normalizeString(entry.type).trim();
    const chapterCount = typeof entry.chapterCount === "number" && Number.isFinite(entry.chapterCount)
        ? entry.chapterCount
        : null;
    const chaptersDownloaded = typeof entry.chaptersDownloaded === "number" && Number.isFinite(entry.chaptersDownloaded)
        ? entry.chaptersDownloaded
        : null;
    const downloadTotal = typeof chaptersDownloaded === "number" ? chaptersDownloaded : 0;
    const chapterTotalText = typeof chapterCount === "number"
        ? `${downloadTotal}/${chapterCount}`
        : `${downloadTotal}`;
    const href = uuid ? `/libraries/${encodeURIComponent(uuid)}` : "/libraries";
    return (
        <RavenPosterCardShell
            title={title}
            coverUrl={coverUrl}
            mediaAlt={`${title} cover`}
            clickable={clickable}
            href={href}
            topContent={(
                <>
                    <Row horizontal="between" vertical="center" gap="8" style={{flexWrap: "wrap"}}>
                        {type && (
                            <Badge background="neutral-alpha-weak" onBackground="neutral-strong">
                                {type}
                            </Badge>
                        )}
                        <Badge background="neutral-alpha-weak" onBackground="neutral-strong">
                            {chapterTotalText}
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
                        {title}
                    </Heading>
                    <Text onBackground="neutral-weak" variant="body-default-xs">
                        Downloaded: {chapterTotalText}
                    </Text>
                </>
            )}
            bottomContent={(
                <Text
                    onBackground="neutral-weak"
                    variant="body-default-xs"
                    style={{
                        minWidth: 0,
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}
                >
                    {lastDownloaded ? `Last: ${lastDownloaded}` : uuid || "No chapter metadata yet"}
                </Text>
            )}
        />
    );
}
