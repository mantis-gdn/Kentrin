# Kentrin Edge Wallet Starter

This is a starter Microsoft Edge extension for Kentrin built on Manifest V3.

## What is included

- popup shell
- dashboard / options page
- background service worker
- encrypted local wallet blob storage
- session unlock / lock flow
- starter recovery phrase flow
- note explorer shell
- transfer preview + submit shell

## Important reality check

This bundle is a **starter scaffold**, not a finished production wallet.

### Already wired
- extension manifest
- popup UI
- dashboard UI
- local encrypted wallet storage
- session storage for unlocked wallet
- `note-read` integration
- `ledger-submit` integration
- canonical transfer preview flow

### Needs hardening next
- real deterministic mnemonic → key derivation
- wallet rename persistence
- true address/account derivation from seed
- note discovery endpoint for full explorer
- stronger backup phrase UX
- production security review

## Load into Edge

1. Open `edge://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## Kentrin API assumptions

This starter expects:

- `/.netlify/functions/note-read?note_id=...`
- `/.netlify/functions/ledger-submit`

Default API base:
- `https://www.kentrin.com`

You can change the API base in the dashboard.

## File map

- `manifest.json` — extension config
- `popup.html` / `popup.js` — compact popup
- `options.html` / `options.js` — main wallet dashboard
- `background.js` — service worker orchestration
- `crypto.js` — wallet crypto helpers
- `storage.js` — extension storage helpers
- `explorer.js` — note lookup helpers
- `send.js` — transfer preview / submit helpers
- `styles.css` — shared styling

## Next recommended build step

Make the seed phrase **truly deterministic** so restore produces the exact same Kentrin key every time instead of the current scaffold behavior.
