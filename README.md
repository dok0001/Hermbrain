# Hermes Mind Cloud (HACS)

HACS-compatible Home Assistant custom integration that adds a sidebar panel visualizing Hermes memories, skills, profile focus and tool layers as an animated mind cloud.

## Features
- Sidebar panel: **Hermes Mind Cloud**
- Reads live Hermes data from `/config/.hermes`
- Visualizes memories, profile, skills and tool/core layers
- Clickable nodes, filters and detail panel

## Install with HACS (custom repository)
1. Put this repository on GitHub or another Git-compatible remote.
2. In Home Assistant, open **HACS → Integrations → ⋮ → Custom repositories**.
3. Add the repository URL.
4. Select category: **Integration**.
5. Search for **Hermes Mind Cloud** in HACS and install it.
6. Restart Home Assistant.
7. Go to **Settings → Devices & Services → Add Integration**.
8. Add **Hermes Mind Cloud** and keep the default path `/config/.hermes` unless you want another Hermes home.

## Manual install (same package)
Copy `custom_components/hermes_mind_cloud` into your HA config's `custom_components/` directory, restart Home Assistant, then add the integration from Devices & Services.

## Notes
- Requires the Hermes data directory to exist at `/config/.hermes` inside the Home Assistant environment.
- Intended for HAOS/Home Assistant custom integration installs via HACS custom repository.
