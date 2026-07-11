from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from aiohttp import web
from homeassistant.helpers.http import HomeAssistantView
from homeassistant.helpers.json import JSONEncoder

from .const import API_URL, DEFAULT_HERMES_PATH


def _split_sections(text: str) -> list[str]:
    return [part.strip() for part in text.split("§") if part.strip()]


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _safe_listdir(path: Path, limit: int = 20) -> list[str]:
    if not path.exists() or not path.is_dir():
        return []
    try:
        return sorted(item.name for item in path.iterdir())[:limit]
    except Exception as err:
        return [f"<error: {err}>"]


def _file_debug(path: Path) -> dict[str, Any]:
    exists = path.exists()
    data: dict[str, Any] = {
        "path": str(path),
        "exists": exists,
        "is_dir": path.is_dir() if exists else False,
        "is_file": path.is_file() if exists else False,
    }
    if exists and path.is_file():
        try:
            text = path.read_text(encoding="utf-8")
            data["size"] = len(text)
            data["preview"] = text[:120]
        except Exception as err:
            data["read_error"] = str(err)
    if exists and path.is_dir():
        data["children"] = _safe_listdir(path)
    return data


def _classify_memory(text: str) -> str:
    low = text.lower()
    if "home assistant" in low or "ha " in low:
        return "system"
    if "drive" in low or "oauth" in low:
        return "integration"
    if "profil" in low or "profile" in low or "research" in low:
        return "workflow"
    if "offentlig" in low or "verifiering" in low:
        return "research"
    return "memory"


def _classify_user(text: str) -> str:
    low = text.lower()
    if "familj" in low or "mia" in low or "alma" in low or "ebbe" in low:
        return "family"
    if "arbetar" in low or "projektchef" in low or "sydställningar" in low:
        return "work"
    if "vill bygga" in low or "app" in low:
        return "projects"
    if "föredrar" in low or "vill ha" in low:
        return "preferences"
    return "identity"


def _infer_skill_categories(skills_root: Path) -> dict[str, str]:
    categories: dict[str, str] = {}
    if not skills_root.exists():
        return categories

    for skill_md in skills_root.rglob("SKILL.md"):
        skill_dir = skill_md.parent
        parts = skill_dir.relative_to(skills_root).parts
        if not parts:
            continue
        skill_name = parts[-1]
        category = "/".join(parts[:-1]) if len(parts) > 1 else "uncategorized"
        categories[skill_name] = category
    return categories


def _build_snapshot(base_path: str) -> dict[str, Any]:
    root = Path(base_path)
    memories_dir = root / "memories"
    skills_root = root / "skills"
    memories_path = memories_dir / "MEMORY.md"
    user_path = memories_dir / "USER.md"
    soul_path = root / "SOUL.md"
    usage_path = skills_root / ".usage.json"

    debug = {
        "root": _file_debug(root),
        "memories_dir": _file_debug(memories_dir),
        "skills_dir": _file_debug(skills_root),
        "memory_file": _file_debug(memories_path),
        "user_file": _file_debug(user_path),
        "soul_file": _file_debug(soul_path),
        "usage_file": _file_debug(usage_path),
    }

    memory_entries = [
        {
            "id": f"memory-{idx}",
            "type": "memory",
            "group": _classify_memory(text),
            "title": text.split(":", 1)[0][:56],
            "text": text,
            "importance": max(0.35, min(1.0, 0.35 + len(text) / 280)),
        }
        for idx, text in enumerate(_split_sections(_read_text(memories_path)), start=1)
    ]

    user_entries = [
        {
            "id": f"user-{idx}",
            "type": "profile",
            "group": _classify_user(text),
            "title": text.split(":", 1)[0][:56],
            "text": text,
            "importance": max(0.35, min(1.0, 0.35 + len(text) / 260)),
        }
        for idx, text in enumerate(_split_sections(_read_text(user_path)), start=1)
    ]

    soul_text = _read_text(soul_path).strip()
    skill_categories = _infer_skill_categories(skills_root)

    usage = {}
    if usage_path.exists():
        usage = json.loads(_read_text(usage_path) or "{}")

    skills = []
    for name, meta in usage.items():
        skills.append(
            {
                "id": f"skill-{name}",
                "type": "skill",
                "name": name,
                "title": name,
                "category": skill_categories.get(name, "uncategorized"),
                "use_count": meta.get("use_count", 0),
                "view_count": meta.get("view_count", 0),
                "patch_count": meta.get("patch_count", 0),
                "last_used_at": meta.get("last_used_at"),
                "pinned": meta.get("pinned", False),
                "state": meta.get("state", "unknown"),
                "importance": max(0.25, min(1.0, 0.25 + meta.get("use_count", 0) / 12)),
                "text": f"Category: {skill_categories.get(name, 'uncategorized')} · Uses: {meta.get('use_count', 0)} · Views: {meta.get('view_count', 0)} · Patches: {meta.get('patch_count', 0)}",
            }
        )

    skills.sort(key=lambda item: (item["use_count"], item["view_count"]), reverse=True)
    top_skills = skills[:24]

    tool_nodes = []
    if memories_path.exists():
        tool_nodes.append({"id": "tool-memory", "type": "tool", "group": "memory", "title": "Memory store", "text": "Reads MEMORY.md and USER.md to maintain long-lived context.", "importance": 0.92})
    if usage_path.exists():
        tool_nodes.append({"id": "tool-skills", "type": "tool", "group": "skills", "title": "Skills registry", "text": "Uses real .usage.json stats for cluster sizing and activity.", "importance": 0.88})
    if soul_text:
        tool_nodes.append({"id": "tool-core", "type": "tool", "group": "core", "title": "SOUL prompt", "text": soul_text[:220], "importance": 0.72})
    if any("home assistant" in entry["text"].lower() for entry in memory_entries + user_entries):
        tool_nodes.append({"id": "tool-ha", "type": "tool", "group": "integration", "title": "Home Assistant", "text": "Home Assistant appears in live Hermes memory and user focus.", "importance": 0.9})
    if any("drive" in entry["text"].lower() for entry in memory_entries + user_entries):
        tool_nodes.append({"id": "tool-drive", "type": "tool", "group": "integration", "title": "Google Drive", "text": "Drive is a persistent external workspace in current memory.", "importance": 0.75})

    return {
        "meta": {
            "base_path": base_path,
            "memory_count": len(memory_entries),
            "profile_count": len(user_entries),
            "skill_count": len(skills),
            "top_skill_count": len(top_skills),
            "tool_count": len(tool_nodes),
        },
        "debug": debug,
        "core": {
            "title": "Hermes Core",
            "text": soul_text or "Hermes Agent core prompt",
        },
        "memories": memory_entries,
        "profile": user_entries,
        "skills": top_skills,
        "tools": tool_nodes,
    }


class HermesMindCloudDataView(HomeAssistantView):
    url = API_URL
    name = "api:hermes_mind_cloud:data"
    requires_auth = True

    def __init__(self, hass, base_path: str) -> None:
        self.hass = hass
        self.base_path = base_path or DEFAULT_HERMES_PATH

    async def get(self, request):
        payload = await self.hass.async_add_executor_job(_build_snapshot, self.base_path)
        return web.Response(
            text=json.dumps(payload, cls=JSONEncoder),
            content_type="application/json",
        )
