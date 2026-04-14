"use client";

import {useEffect, useState} from "react";
import {Button} from "@once-ui-system/core";
import {resolveKavitaBaseUrl} from "@/utils/kavitaLinks";

export function FooterKavitaButton() {
    const [baseUrl, setBaseUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            const nextUrl = await resolveKavitaBaseUrl();
            if (!cancelled && nextUrl) {
                setBaseUrl(nextUrl);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    if (!baseUrl) {
        return null;
    }

    return (
        <Button size="s" variant="secondary" onClick={() => window.open(baseUrl, "_blank", "noopener,noreferrer")}>
            Open Kavita
        </Button>
    );
}
