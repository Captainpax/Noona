import {Card, Column, Row, SmartLink, Text} from "@once-ui-system/core";
import type {CSSProperties, ReactNode} from "react";

export const RAVEN_POSTER_CARD_WIDTH = 240;
export const RAVEN_POSTER_CARD_HEIGHT = 340;

type RavenPosterCardShellProps = {
    title: string;
    coverUrl?: string | null;
    mediaAlt?: string;
    topContent: ReactNode;
    bottomContent?: ReactNode;
    clickable?: boolean;
    href?: string;
    className?: string;
    style?: CSSProperties;
};

const FALLBACK_BACKGROUND = {
    background:
        "radial-gradient(circle at top, color-mix(in srgb, var(--brand-background-strong) 32%, transparent), transparent 48%), linear-gradient(160deg, rgba(10, 19, 34, 0.92), rgba(6, 10, 20, 0.98))",
};

export function RavenPosterCardShell({
                                         title,
                                         coverUrl,
                                         mediaAlt,
                                         topContent,
                                         bottomContent,
                                         clickable = false,
                                         href,
                                         className,
                                         style,
                                     }: RavenPosterCardShellProps) {
    const normalizedTitle = title.trim() || "Untitled";
    const normalizedCover = typeof coverUrl === "string" ? coverUrl.trim() : "";

    const card = (
        <Card
            background="surface"
            border="neutral-alpha-weak"
            padding="0"
            radius="l"
            fillWidth
            className={className}
            style={{
                position: "relative",
                overflow: "hidden",
                width: "100%",
                height: RAVEN_POSTER_CARD_HEIGHT,
                ...style,
            }}
        >
            {normalizedCover ? (
                // eslint-disable-next-line @next/next/no-img-element -- Cover URLs come from arbitrary remote hosts.
                <img
                    src={normalizedCover}
                    alt={mediaAlt || `${normalizedTitle} cover`}
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                    }}
                    loading="lazy"
                />
            ) : (
                <Row
                    fill
                    background="neutral-alpha-weak"
                    style={{
                        position: "absolute",
                        inset: 0,
                        alignItems: "center",
                        justifyContent: "center",
                        ...FALLBACK_BACKGROUND,
                    }}
                >
                    <Text variant="heading-strong-l" style={{fontFamily: "var(--font-code)"}}>
                        {normalizedTitle.slice(0, 1) || "?"}
                    </Text>
                </Row>
            )}

            <Column
                fill
                style={{
                    position: "absolute",
                    inset: 0,
                    justifyContent: "space-between",
                }}
            >
                <Column
                    gap="8"
                    padding="12"
                    background="overlay"
                    style={{
                        background: "linear-gradient(180deg, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.15) 100%)",
                    }}
                >
                    {topContent}
                </Column>

                {bottomContent ? (
                    <Row
                        padding="12"
                        background="overlay"
                        style={{
                            background: "linear-gradient(0deg, rgba(0, 0, 0, 0.78) 0%, rgba(0, 0, 0, 0) 100%)",
                        }}
                    >
                        {bottomContent}
                    </Row>
                ) : null}
            </Column>
        </Card>
    );

    if (clickable && href) {
        return (
            <SmartLink
                href={href}
                unstyled
                fillWidth
                style={{display: "block", width: "100%"}}
            >
                {card}
            </SmartLink>
        );
    }

    return (
        <Column fillWidth aria-disabled={!clickable} style={{width: "100%"}}>
            {card}
        </Column>
    );
}
