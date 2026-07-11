# Hermes Mind Cloud

HACS-compatible Home Assistant custom integration that adds a sidebar panel visualizing Hermes memories, skills, profile focus and tool layers as an animated mind cloud.

## Features
- Sidebar panel: **Hermes Mind Cloud**
- Reads live Hermes data from `/config/.hermes`
- Visualizes memories, profile, skills and tool/core layers
- Clickable nodes, filters and detail panel

## Install with HACS (custom repository)
1. In Home Assistant, open **HACS → Integrations → ⋮ → Custom repositories**.
2. Add repository URL: `https://github.com/dok0001/Hermbrain`
3. Select category: **Integration**.
4. Install **Hermes Mind Cloud** from HACS.
5. Restart Home Assistant.
6. Go to **Settings → Devices & Services → Add Integration**.
7. Add **Hermes Mind Cloud** and keep the default path `/config/.hermes` unless you want another Hermes home.

## Notes
- Requires the Hermes data directory to exist at `/config/.hermes` inside the Home Assistant environment.
- If HACS install fails and you previously copied the component manually, remove any old `/config/custom_components/hermes_mind_cloud` folder first, then retry.
