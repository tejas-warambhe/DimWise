/**
 * DimWise — Service Worker (Background)
 *
 * Responsibilities:
 *  1. Generates the toolbar icon dynamically via OffscreenCanvas
 *     (no PNG files needed during development).
 *  2. Seeds default global settings on first install.
 *  3. Reflects enabled/disabled state in the icon.
 */
'use strict';

// ─── Icon Drawing ─────────────────────────────────────────────────────────────

/**
 * Draws a sun icon onto an OffscreenCanvas and returns an ImageData.
 * @param {number} size   Canvas dimension (16, 32, 48 …)
 * @param {boolean} active Whether the extension is enabled (affects opacity)
 */
function drawSunIcon(size, active = true) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.27;
  const alpha = active ? 1.0 : 0.35;
  const color = `rgba(251, 191, 36, ${alpha})`; // warm amber

  // Sun core
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Rays
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r * 1.35, cy + Math.sin(angle) * r * 1.35);
    ctx.lineTo(cx + Math.cos(angle) * r * 1.78, cy + Math.sin(angle) * r * 1.78);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

function setActionIcon(active = true) {
  chrome.action.setIcon({
    imageData: {
      16: drawSunIcon(16, active),
      32: drawSunIcon(32, active),
      48: drawSunIcon(48, active),
    },
  });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Draw the initial icon
  setActionIcon(true);

  // Seed global defaults if not already present
  chrome.storage.sync.get('global', (data) => {
    if (!data.global) {
      chrome.storage.sync.set({
        global: { enabled: true, mode: 'auto', strength: 50, manual: 0.85 },
      });
    }
  });
});

// Keep icon in sync when the global "enabled" setting changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.global) {
    const enabled = changes.global.newValue?.enabled !== false;
    setActionIcon(enabled);
  }
});
