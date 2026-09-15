# Data Client

Windows desktop PostgreSQL manager with visual editors for databases, schemas, tables, views, and data.

**Current release: 0.1.0-beta.1**

Repository: [https://github.com/aungzawmyo/data_client](https://github.com/aungzawmyo/data_client)

## Features

- Saved connections with SSL modes and OS-encrypted passwords
- Object explorer with database / schema / table counts and sizes
- SQL editor (CodeMirror) with multiple result sets — `F5` or `Ctrl+Enter`
- SQL history pane and status bar (PostgreSQL version, uptime, server time)
- Table data browser: paging, SQL filter, insert, edit, delete
- Visual table designer: columns, indexes, foreign keys, live `CREATE` / `ALTER`
- Visual view designer
- Schema table list (name, rows, size, updated, engine, comment, type)
- Schema designer: drag-and-drop tables, FK lines, zoom to 5%, pan, fit
- Auto layout: horizontal (3+ rows), vertical (3 columns), square, custom grid, radial mind-map
- Create / drop databases and schemas
- File / View / Appearance / Tools menus, themes (dark, midnight, light), compact density
- Several connections at once (session pills), SSH tunnel, object search (`Ctrl+P`)
- Export/copy result grids (CSV, JSON, TSV, INSERT), sortable columns, query cancel/timeout
- Saved SQL snippets, EXPLAIN ANALYZE, CSV import, SELECT * LIMIT warning
- Sequences, functions, triggers, and types in the explorer
- Schema diagram export (PNG/SVG), FK hop from a data cell, schema diff → migration SQL

## Develop

Requirements: Node.js 20+, a reachable PostgreSQL server.

```bash
npm install
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

## Package for Windows

```bash
npm run dist
```

The NSIS installer is written to `dist/` as `Data Client-0.1.0-beta.1-setup.exe`.

## Beta notes

- PostgreSQL only (no MySQL / SQL Server in this release)
- Table **Created** is empty: PostgreSQL does not store relation create time
- Catalog queries (explorer refresh, table list) are not written to SQL history
- `CREATE DATABASE` / `DROP DATABASE` need sufficient privileges
- Row edits use PostgreSQL `ctid`; vacuum/rewrite can invalidate in-progress edits — reload the grid before saving if that happens
- This build is unsigned (Windows SmartScreen may warn on first run)
- Installer currently uses the default Electron icon

## Stack

Electron, Vite, React, TypeScript, node-postgres (`pg`), CodeMirror.

## License

MIT · AOS 2026
