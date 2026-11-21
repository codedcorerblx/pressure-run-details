# Pressure Run Details (PRD)

Previously *Pressure Modifiers Selector* (PMS). A run-details selector for the Roblox game **Pressure**, built on the Modifier Console system: same theme, versions, permalink and Read Only systems.

## Editing the options
- Dropdown cards: `data/<version>/fields.json` (`"integer": "Integer"` adds a number box when that option is chosen).
- Dead-Drop dropdowns: `data/<version>/dead-drops.json` (replace Example1/2/3).
- Themes: `data/config_theme.json`. Versions: `data/versions.json`.

Adding or reordering options changes the bit positions in permalinks, so ship a new version slug when you do.
