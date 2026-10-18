# OpenSaysMe changes

## 1.0.1 — integration branch

- Added a white-and-blue keyhole icon with matching availability, library, citation, warning, and disabled variants.
- Applied a common light theme to both popup tabs, all settings screens, and article badges.
- Updated visible app names, page titles, tooltips, and all nine packaged language catalogs to OpenSaysMe.
- Removed the inherited extension-version warning and upstream update prompt from the renamed local build.
- Handled missing content-script receivers during tab activation and badge hiding. A regression check reproduces the missing-receiver condition without recording an unchecked runtime warning.
- Added branch-specific ZIP installation, update, and troubleshooting instructions.

## 1.0.0 — initial integration

- Combined Bypass Paywalls Clean 2.7.1.1 and Open Access Helper Web 2026.8 under one Manifest V3 extension.
- Added a shared popup and settings hub with separate news and research preferences.
- Ported network handling to declarative rules and script injection to `chrome.scripting`.
- Preserved custom-site detection and settings, publisher exclusions, and DOI-based open-access discovery.
- Added isolated Edge validation for network rules, custom-site handling, research lookup, and settings isolation.

The inherited `changelog.txt` records the original Bypass Paywalls Clean history.
