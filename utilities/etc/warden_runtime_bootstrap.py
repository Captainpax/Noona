#!/usr/bin/env python3
import json
import os
import shlex
import sys
import urllib.error
import urllib.parse
import urllib.request


def _normalize_string(value):
    return value.strip() if isinstance(value, str) else ""


def _normalize_env_map(value):
    if not isinstance(value, dict):
        return {}

    normalized = {}
    for key, entry in value.items():
        normalized_key = _normalize_string(key)
        if not normalized_key:
            continue
        normalized[normalized_key] = "" if entry is None else str(entry)
    return normalized


def _warn(message):
    sys.stderr.write(f"{message}\n")


def _resolve_bootstrap():
    service_name = _normalize_string(os.environ.get("SERVICE_NAME"))
    base_url = _normalize_string(os.environ.get("WARDEN_BASE_URL"))
    token = _normalize_string(os.environ.get("WARDEN_API_TOKEN"))

    if not service_name or not base_url or not token:
        return {}

    request_url = urllib.parse.urljoin(
        base_url.rstrip("/") + "/",
        f"api/services/{urllib.parse.quote(service_name, safe='')}/config?includeSecrets=true",
    )
    request = urllib.request.Request(
        request_url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = f"HTTP {error.code}"
        try:
            payload = json.loads(error.read().decode("utf-8"))
            if isinstance(payload, dict) and isinstance(payload.get("error"), str):
                detail = payload["error"].strip() or detail
        except Exception:
            pass
        _warn(f"[{service_name}] Failed to restore runtime config from Warden: {detail}")
        return {}
    except Exception as error:
        _warn(f"[{service_name}] Unable to reach Warden for runtime config restore: {error}")
        return {}

    return {
        **_normalize_env_map(payload.get("env")),
        **_normalize_env_map(payload.get("runtimeConfig", {}).get("env")),
    }


def _print_shell_exports(env_updates):
    for key, value in env_updates.items():
        print(f"export {key}={shlex.quote(value)}")


def main(argv):
    env_updates = _resolve_bootstrap()

    if argv and argv[0] == "--print-shell":
        _print_shell_exports(env_updates)
        return 0

    command = argv
    if command and command[0] == "--":
        command = command[1:]

    if not command:
        return 0

    for key, value in env_updates.items():
        os.environ[key] = value

    os.execvpe(command[0], command, os.environ)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
