#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def github_latest_release(repo: str) -> dict:
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    req = urllib.request.Request(url, headers={"User-Agent": "hermes-agent"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Hermes Mind Cloud HACS release metadata and zip layout.")
    parser.add_argument("--version", required=True, help="Expected version, e.g. 0.1.26")
    parser.add_argument("--repo", default="dok0001/Hermbrain", help="GitHub repo in owner/name form")
    parser.add_argument(
        "--zip-layout",
        choices=("root", "nested"),
        default="root",
        help="Expected layout inside the release zip",
    )
    parser.add_argument(
        "--zip-path",
        default=None,
        help="Optional explicit zip path. Defaults to /config/hermes_mind_cloud_hacs_v<version>.zip",
    )
    args = parser.parse_args()

    expected = args.version
    root = Path(__file__).resolve().parents[1]
    live_manifest_path = Path("/config/custom_components/hermes_mind_cloud/manifest.json")
    hacs_manifest_path = root / "custom_components" / "hermes_mind_cloud" / "manifest.json"
    hacs_json_path = root / "hacs.json"
    zip_path = Path(args.zip_path) if args.zip_path else Path(f"/config/hermes_mind_cloud_hacs_v{expected}.zip")

    live_manifest = load_json(live_manifest_path)
    hacs_manifest = load_json(hacs_manifest_path)
    hacs_json = load_json(hacs_json_path)

    require(live_manifest.get("version") == expected, f"live manifest version mismatch: {live_manifest.get('version')}")
    require(hacs_manifest.get("version") == expected, f"HACS manifest version mismatch: {hacs_manifest.get('version')}")
    require(
        hacs_json.get("filename") == f"hermes_mind_cloud_hacs_v{expected}.zip",
        f"hacs.json filename mismatch: {hacs_json.get('filename')}",
    )
    require(zip_path.exists(), f"zip not found: {zip_path}")

    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        if args.zip_layout == "root":
            require("manifest.json" in names, "zip missing root manifest.json")
            require("__init__.py" in names, "zip missing root __init__.py")
            require(
                "custom_components/hermes_mind_cloud/manifest.json" not in names,
                "zip unexpectedly contains nested custom_components path",
            )
            manifest_name = "manifest.json"
        else:
            require(
                "custom_components/hermes_mind_cloud/manifest.json" in names,
                "zip missing nested manifest path",
            )
            require(
                "custom_components/hermes_mind_cloud/__init__.py" in names,
                "zip missing nested __init__.py path",
            )
            manifest_name = "custom_components/hermes_mind_cloud/manifest.json"

        zip_manifest = json.loads(archive.read(manifest_name))
        require(zip_manifest.get("version") == expected, f"zip manifest version mismatch: {zip_manifest.get('version')}")

    latest = github_latest_release(args.repo)
    latest_assets = [asset.get("name") for asset in latest.get("assets", [])]
    require(latest.get("tag_name") == f"v{expected}", f"latest release tag mismatch: {latest.get('tag_name')}")
    require(f"hermes_mind_cloud_hacs_v{expected}.zip" in latest_assets, f"missing latest release asset: {latest_assets}")

    result = {
        "ok": True,
        "live_manifest_version": live_manifest.get("version"),
        "hacs_manifest_version": hacs_manifest.get("version"),
        "hacs_filename": hacs_json.get("filename"),
        "zip_path": str(zip_path),
        "zip_layout": args.zip_layout,
        "latest_release_tag": latest.get("tag_name"),
        "latest_release_assets": latest_assets,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
