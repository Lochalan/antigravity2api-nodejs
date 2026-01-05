# Frontend Module Documentation

Original `app.js` (1300+ lines) has been split into the following modules:

## Module Structure

```
js/
├── utils.js    - Utility functions (font size, sensitive info hiding)
├── ui.js       - UI components (Toast, Modal, Loading, Tab switching)
├── auth.js     - Authentication (login, logout, OAuth authorization)
├── tokens.js   - Token management (CRUD, enable/disable, inline editing)
├── quota.js    - Quota management (view, refresh, cache, inline display)
├── config.js   - Configuration management (load, save, rotation strategy)
└── main.js     - Main entry (initialization, event binding)
```

## Load Order

Modules are loaded by dependency order (in `index.html`):

1. **utils.js** - Base utility functions
2. **ui.js** - UI components (depends on utils)
3. **auth.js** - Auth module (depends on ui)
4. **quota.js** - Quota module (depends on auth)
5. **tokens.js** - Token module (depends on auth, quota, ui)
6. **config.js** - Config module (depends on auth, ui)
7. **main.js** - Main entry (depends on all modules)

## Notes

1. Modules communicate through global variables and functions
2. Maintain load order to avoid dependency issues
3. Be aware of cross-module function calls when modifying
