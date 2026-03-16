# DimWise

Smart per-tab brightness control for your browser. DimWise analyzes each page's background color and automatically dims bright pages while leaving dark ones untouched.

Unlike system-level brightness that affects your entire screen, DimWise works **per-tab** — each website gets the right brightness without touching anything else.

## Features

- **Content-aware auto mode** — detects page luminance using WCAG relative luminance and dims accordingly
- **Manual mode** — set a fixed brightness level with a slider
- **Per-site overrides** — save different preferences for different websites
- **Live preview** — see changes in real-time as you drag the slider
- **Managed sites dashboard** — view and remove all your custom site settings in one place
- **Adjustable strength** — control how aggressively auto mode reduces brightness
- **Dark mode detection** — re-adjusts automatically when a site toggles between light and dark themes
- **Zero data collection** — no analytics, no network requests, everything stays in your browser
- **Lightweight** — no frameworks, no dependencies, pure vanilla JS under 15KB

## How it works

1. The content script reads the computed `background-color` of the page's root elements (`<html>`, `<body>`, `<main>`, etc.)
2. Converts the color to [WCAG relative luminance](https://www.w3.org/TR/WCAG20/#relativeluminancedef) (0 = black, 1 = white)
3. Maps luminance to a target brightness: bright pages get dimmed, dark pages stay at 100%
4. Applies `filter: brightness(X)` to the `<html>` element

The formula at default strength (50%):
| Page | Luminance | Applied brightness |
|------|-----------|--------------------|
| White background | 1.0 | 85% |
| Medium gray | 0.5 | 92% |
| Dark background | ~0 | 100% |

## Installation

### Chrome Web Store

Coming soon (under review).

### Load unpacked (development)

1. Clone this repo:
   ```bash
   git clone https://github.com/tejas-warambhe/brightness-controller.git
   cd brightness-controller
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the cloned folder
5. The DimWise icon appears in your toolbar — click it to open the popup

## Project structure

```
.
├── manifest.json          Manifest V3 config
├── content.js             Injected into every page — luminance detection + filter
├── background.js          Service worker — dynamic icon + default settings
└── popup/
    ├── popup.html         Popup markup
    ├── popup.css          Dark-themed UI styles
    └── popup.js           Popup logic — settings, sliders, managed sites
```

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save brightness preferences locally via `chrome.storage.sync` |
| `scripting` | Inject content script into tabs that were open before installation |
| `host_permissions` (http/https) | Read background colors and apply CSS brightness filter on web pages |

No data is collected or transmitted. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a PR

## License

MIT
