import {NextResponse} from "next/server";
import {jsonError, sageJson} from "../../../../_backend";
import {withNoonaAuthHeaders} from "../../../../_auth";
import {formatVpnTestLoginErrorMessage, requestVpnTestLoginFromSage,} from "@/utils/vpnTestLogin.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    let body: Record<string, unknown> = {};

    try {
        const parsed = await request.json();
        body = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
        // Accept an empty body and fall back to persisted Vault credentials.
    }

    try {
        const {status, payload} = await requestVpnTestLoginFromSage({
            body,
            sageJsonImpl: sageJson,
            withNoonaAuthHeadersImpl: withNoonaAuthHeaders,
        });
        return NextResponse.json(payload, {status});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(formatVpnTestLoginErrorMessage(message));
    }
}
