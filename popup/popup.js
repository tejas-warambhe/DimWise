/**
 * Brightness Controller — Popup Script
 *
 * Manages the popup UI:
 *  - Reads settings from chrome.storage.sync
 *  - Reads current page luminance from the content script
 *  - Sends live PREVIEW messages while sliders are dragging
 *  - Saves settings on every meaningful change (debounced for sliders)
 */
'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function sendToContent(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(resp);
      }
    });
  });
}

function defaultSettings() {
  return { enabled: true, mode: 'auto', strength: 50, manual: 0.85 };
}

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  tabId: null,
  hostname: '',
  settings: null,      // active settings object (site-specific or global)
  hasSiteSettings: false,
  lum: null,           // detected page luminance (0–1)
  contentAvailable: false,
};

// ─── Storage ──────────────────────────────────────────────────────────────────

async function loadSettings() {
  const siteKey = `site:${state.hostname}`;
  const data = await chrome.storage.sync.get(['global', siteKey]);
  const global = data.global || defaultSettings();
  const site = data[siteKey];
  state.hasSiteSettings = !!site;
  state.settings = site ? { ...site } : { ...global };
}

let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistSettings, 400);
}

async function persistSettings() {
  const siteKey = `site:${state.hostname}`;
  if (state.hasSiteSettings) {
    await chrome.storage.sync.set({ [siteKey]: state.settings });
  } else {
    await chrome.storage.sync.set({ global: state.settings });
  }
  if (state.contentAvailable) {
    sendToContent(state.tabId, { type: 'REFRESH' }).catch(() => {});
  }
}

// ─── UI Rendering ─────────────────────────────────────────────────────────────

function renderAll() {
  const s = state.settings;

  // Enabled toggle
  $('enabled').checked = s.enabled;
  $('bc-body').classList.toggle('disabled', !s.enabled);

  // Mode tabs + panels
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.mode === s.mode);
  });
  $('auto-panel').classList.toggle('hidden', s.mode !== 'auto');
  $('manual-panel').classList.toggle('hidden', s.mode !== 'manual');

  // Strength slider
  const strength = s.strength ?? 50;
  $('strength').value = strength;
  $('strength-val').textContent = strength + '%';

  // Manual brightness slider
  const manualPct = Math.round((s.manual ?? 0.85) * 100);
  $('brightness').value = manualPct;
  $('brightness-val').textContent = manualPct + '%';

  // Luminance display
  updateLumDisplay();

  // Per-site checkbox
  $('per-site').checked = state.hasSiteSettings;
  $('hostname').textContent = state.hostname || 'this site';
}

function updateLumDisplay() {
  const lum = state.lum;
  if (lum === null) return;

  const lumPct = Math.round(lum * 100);
  $('lum-fill').style.width = lumPct + '%';
  $('lum-val').textContent = lumPct + '%';

  if (state.settings.mode === 'auto') {
    const maxReduction = 0.30 * ((state.settings.strength ?? 50) / 100);
    const br = 1 - lum * maxReduction;
    $('applied-val').textContent = Math.round(br * 100) + '%';
  } else {
    const manualPct = Math.round((state.settings.manual ?? 0.85) * 100);
    $('applied-val').textContent = manualPct + '%';
  }
}

function showUnavailable(message) {
  $('bc-body').innerHTML = `
    <div class="unavailable">
      <span class="emoji">🔆</span>
      ${message}
    </div>
  `;
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function bindEvents() {
  // Enabled toggle
  $('enabled').addEventListener('change', (e) => {
    state.settings.enabled = e.target.checked;
    $('bc-body').classList.toggle('disabled', !e.target.checked);
    persistSettings();
  });

  // Mode tabs
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      state.settings.mode = mode;
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.mode === mode);
      });
      $('auto-panel').classList.toggle('hidden', mode !== 'auto');
      $('manual-panel').classList.toggle('hidden', mode !== 'manual');
      updateLumDisplay();
      persistSettings();
    });
  });

  // Strength slider — live preview while dragging
  $('strength').addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    state.settings.strength = v;
    $('strength-val').textContent = v + '%';
    updateLumDisplay();

    if (state.contentAvailable && state.settings.enabled && state.settings.mode === 'auto') {
      const maxReduction = 0.30 * (v / 100);
      const br = parseFloat((1 - (state.lum ?? 1) * maxReduction).toFixed(2));
      sendToContent(state.tabId, { type: 'PREVIEW', value: br }).catch(() => {});
    }
    scheduleSave();
  });

  // Manual brightness slider — live preview while dragging
  $('brightness').addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    state.settings.manual = v / 100;
    $('brightness-val').textContent = v + '%';
    updateLumDisplay();

    if (state.contentAvailable && state.settings.enabled && state.settings.mode === 'manual') {
      sendToContent(state.tabId, { type: 'PREVIEW', value: v / 100 }).catch(() => {});
    }
    scheduleSave();
  });

  // Per-site toggle
  $('per-site').addEventListener('change', async (e) => {
    const siteKey = `site:${state.hostname}`;
    state.hasSiteSettings = e.target.checked;

    if (state.hasSiteSettings) {
      // Fork global settings into a site-specific copy
      const data = await chrome.storage.sync.get('global');
      state.settings = { ...(data.global || defaultSettings()) };
      await chrome.storage.sync.set({ [siteKey]: state.settings });
    } else {
      // Remove site override, fall back to global
      await chrome.storage.sync.remove(siteKey);
      const data = await chrome.storage.sync.get('global');
      state.settings = { ...(data.global || defaultSettings()) };
    }

    renderAll();
    if (state.contentAvailable) {
      sendToContent(state.tabId, { type: 'REFRESH' }).catch(() => {});
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    // Get active tab (no `tabs` permission needed — we only read id, not url)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tabId = tab.id;

    // Ask the content script for hostname + current luminance.
    // If it doesn't respond (tab was open before extension was loaded),
    // inject it programmatically and retry once.
    let contentResp = null;
    try {
      contentResp = await sendToContent(tab.id, { type: 'GET_STATE' });
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        // Give the script a moment to initialise
        await new Promise((r) => setTimeout(r, 80));
        contentResp = await sendToContent(tab.id, { type: 'GET_STATE' });
      } catch {
        showUnavailable(
          'Brightness control isn\'t available on this page.<br>' +
          'It works on regular http/https websites.'
        );
        return;
      }
    }

    state.contentAvailable = true;

    state.hostname = contentResp.hostname;
    state.lum = contentResp.lum;

    await loadSettings();
    renderAll();
    bindEvents();

  } catch (err) {
    showUnavailable('Something went wrong: ' + err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
