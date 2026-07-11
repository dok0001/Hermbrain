# Hermes Mind Cloud for Home Assistant

Custom sidebar panel for visualizing Hermes memories, skills, profile focus and tool layers as an animated 3D-like cloud.

## Installed files
- `custom_components/hermes_mind_cloud/manifest.json`
- `custom_components/hermes_mind_cloud/__init__.py`
- `custom_components/hermes_mind_cloud/config_flow.py`
- `custom_components/hermes_mind_cloud/api.py`
- `custom_components/hermes_mind_cloud/const.py`
- `custom_components/hermes_mind_cloud/strings.json`
- `custom_components/hermes_mind_cloud/www/hermes-mind-cloud-panel.js`

## What it does
- Adds a sidebar panel: **Hermes Mind Cloud**
- Reads live Hermes data from `/config/.hermes`
- Visualizes:
  - memory entries from `memories/MEMORY.md`
  - user profile entries from `memories/USER.md`
  - skill usage from `skills/.usage.json`
  - core prompt from `SOUL.md`
- Includes filters and clickable node details

## Install / activate
1. **Restart Home Assistant** so the new custom integration is discovered.
2. Go to **Settings → Devices & Services → Add Integration**.
3. Search for **Hermes Mind Cloud**.
4. Leave the default Hermes path as `/config/.hermes` unless you want another profile/home.
5. Finish setup.
6. A new sidebar item named **Hermes Mind Cloud** should appear.

## Notes
- This integration is local-only and reads files directly from the Home Assistant host config directory.
- If you later want another Hermes profile, change the path during setup or extend the config flow.
- Preview page for local development:
  - `http://127.0.0.1:8765/custom_components/hermes_mind_cloud/www/preview.html`
