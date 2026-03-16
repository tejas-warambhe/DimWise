/**
 * DimWise — Content Script
 *
 * Runs in every http/https page. Detects page luminance from DOM background
 * colors and applies a CSS brightness filter to the <html> element.
 * Supports two modes:
 *   auto   — derives target brightness from detected page luminance + strength
 *   manual — user-defined fixed brightness level
 */
(function () {
  'use strict';

  let savedFilter = null; // page's original html.style.filter
  let rerunDebounce = null;

  // ─── Filter Application ──────────────────────────────────────────────────

  function applyBrightness(value) {
    if (savedFilter === null) {
      // First call: save whatever filter the page had (usually empty)
      savedFilter = document.documentElement.style.filter || '';
    }
    // Strip any previous brightness() we set, then append new one
    const base = savedFilter.replace(/\s*brightness\([^)]*\)/gi, '').trim();
    document.documentElement.style.filter = base
      ? `${base} brightness(${value})`
      : `brightness(${value})`;
  }

  function removeBrightness() {
    if (savedFilter !== null) {
      document.documentElement.style.filter = savedFilter;
      savedFilter = null;
    }
  }

  // ─── Luminance Detection ─────────────────────────────────────────────────

  /**
   * Converts a CSS rgb/rgba color string to WCAG relative luminance (0–1).
   * Returns null if the color cannot be parsed.
   */
  function cssColorToLuminance(colorStr) {
    const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    const linearize = (x) => {
      const c = parseInt(x) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linearize(m[1]) + 0.7152 * linearize(m[2]) + 0.0722 * linearize(m[3]);
  }

  /**
   * Walks candidate elements (largest/most prominent first) and returns the
   * first non-transparent background-color's luminance.
   * Falls back to 1.0 (white) if nothing is found.
   */
  function detectPageLuminance() {
    const candidates = [
      document.documentElement,
      document.body,
      document.querySelector('main, [role="main"], #main, #content, .content'),
      document.querySelector('article, .article, .post'),
    ].filter(Boolean);

    for (const el of candidates) {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
      const lum = cssColorToLuminance(bg);
      if (lum !== null) return lum;
    }
    return 1.0; // Default: assume bright white page
  }

  // ─── Brightness Calculation ───────────────────────────────────────────────

  /**
   * Maps page luminance + user strength (0–100) to a target brightness.
   *
   * At strength=100:  white page (lum=1.0) → brightness 0.70
   * At strength=50:   white page (lum=1.0) → brightness 0.85
   * At strength=0:    no reduction at all  → brightness 1.00
   * Dark pages (lum≈0) are always left at 1.0 regardless of strength.
   */
  function calcAutoBrightness(luminance, strength) {
    const maxReduction = 0.30 * (strength / 100);
    return parseFloat((1 - luminance * maxReduction).toFixed(2));
  }

  // ─── Settings ────────────────────────────────────────────────────────────

  function defaultSettings() {
    return { enabled: true, mode: 'auto', strength: 50, manual: 0.85 };
  }

  function loadSettings(callback) {
    const siteKey = `site:${location.hostname}`;
    chrome.storage.sync.get(['global', siteKey], (data) => {
      const global = data.global || defaultSettings();
      const site = data[siteKey];
      callback(site || global);
    });
  }

  // ─── Main Logic ───────────────────────────────────────────────────────────

  function run() {
    loadSettings((settings) => {
      if (!settings.enabled) {
        removeBrightness();
        return;
      }

      if (settings.mode === 'manual') {
        applyBrightness(settings.manual ?? 0.85);
        return;
      }

      // Auto mode: detect luminance → compute brightness
      const lum = detectPageLuminance();
      const br = calcAutoBrightness(lum, settings.strength ?? 50);
      applyBrightness(br);

      // Notify popup if it's open (fire-and-forget; ignore if no listener)
      try { chrome.runtime.sendMessage({ type: 'STATE_UPDATE', lum, br }); } catch (_) {}
    });
  }

  // ─── Message Handler (from popup) ─────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    switch (msg.type) {
      case 'GET_STATE': {
        reply({ lum: detectPageLuminance(), hostname: location.hostname });
        return true;
      }
      case 'PREVIEW': {
        // Live preview while slider is dragging — not saved
        applyBrightness(msg.value);
        reply({ ok: true });
        return true;
      }
      case 'REFRESH': {
        run();
        reply({ ok: true });
        return true;
      }
    }
  });

  // ─── Initialise ───────────────────────────────────────────────────────────

  run();

  // Re-run after full page load in case background colors change post-DOMContentLoaded
  if (document.readyState !== 'complete') {
    window.addEventListener('load', run, { once: true });
  }

  // Watch for dark-mode class/attribute toggles (e.g. adding "dark" class to <html>)
  const mo = new MutationObserver(() => {
    clearTimeout(rerunDebounce);
    rerunDebounce = setTimeout(run, 350);
  });

  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-bs-theme', 'data-mode'],
  });

  if (document.body) {
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-scheme'],
    });
  }
})();
