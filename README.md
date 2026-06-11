# Reader

Single-user PWA zum Lesen, Markieren, Annotieren und Bewerten von Markdown-Notizen aus Nextcloud — im Preprint/LaTeX-Look (Computer-Modern-Überschriften, Papier-Hintergrund, Hairlines statt Cards).

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Danach `http://localhost:3000` öffnen. Die App ist auf Android/Chrome installierbar und für ein Samsung-Handy optimiert.

## Nextcloud

Setze in `.env`:

```bash
NEXTCLOUD_URL=https://nextcloud.example.com/remote.php/dav/files/<user>
NEXTCLOUD_USERNAME=<user>
NEXTCLOUD_APP_PASSWORD=<app-password>
NEXTCLOUD_BASE_PATH=/Workstation/Projects/maths/00_inbox/reader-pipeline/
```

Alle WebDAV-Zugriffe laufen serverseitig über die Next.js API-Routes. Das Frontend bekommt keine Nextcloud-Credentials.

## Ansichten

- **Liste** (`/`): filterbar nach Status, Quelle, Tags, Suche (inkl. Volltext im lokalen Cache) und Sortierung. Dedup, »Neu heute«- und Galois-Filter.
- **Triage** (`/triage`): ein unbewerteter Artikel nach dem anderen — Titel, Metadaten, Textvorschau. Bewerten mit `1`/`2`/`3`, Überspringen mit `→`, Fortschrittszähler.
- **Library** (`/library`): alle als relevant/high bewerteten Artikel, gruppierbar nach Monat, Tag oder Quelle, mit Filter.
- **Reader** (`/article/[id]`): Inhaltsverzeichnis (`c`), Notiz pro Artikel (`n`, wird ins Frontmatter geschrieben), References & Tools (arXiv abs/PDF, BibTeX- und Zitat-Copy, Obsidian-Deep-Link), Lesefortschritt, Highlights.
- **Settings** (`/settings`): Präferenzen, Obsidian-Vault-Konfiguration, Aktivitäts-Heatmap mit Streaks, Shortcut-Übersicht, Sync-Log.
- **Command Palette** (`Ctrl/⌘ K`): Fuzzy-Suche über alle Artikel plus Navigations-, Filter-, Sync- und Theme-Befehle.

## Bedienung

- Artikel öffnen, horizontal wischen oder Pfeiltasten nutzen.
- `1`, `2`, `3` bewerten als irrelevant, relevant, high relevant — in Liste, Reader und Triage.
- Text im Reader markieren und `Markieren` tippen. Die App schreibt den Treffer als Obsidian/Markdown-Highlight `==markierter Text==` zurück in die Markdown-Datei.
- Notizen werden als `reader_note` ins Frontmatter geschrieben; offline erfasste Notizen, Ratings und Highlights landen in einer Pending-Queue und werden beim nächsten Online-Kontakt synchronisiert.
- Optionales Frontmatter für bewusst vorgemerkte Artikel: `reader_priority: 200` oder `reader_pinned: true` (wird nur für `source: galois` priorisiert).

### Tastaturkürzel

| Taste | Wirkung |
| --- | --- |
| `Ctrl/⌘ K` | Command Palette |
| `/` | Suche fokussieren (Liste) |
| `t` / `b` | Triage / Library öffnen (Liste) |
| `← →` | Vorheriger / nächster Artikel |
| `1` `2` `3` | Bewerten |
| `c` | Inhaltsverzeichnis (Reader) |
| `n` | Notiz fokussieren (Reader) |
| `o` | Originalquelle öffnen (Reader) |
| `?` | Shortcut-Overlay |
| `Esc` | Zurück / Overlay schließen |

## Obsidian

Unter Settings → Obsidian den Vault-Namen und den Pipeline-Ordner relativ zur Vault-Wurzel eintragen (z. B. `00_inbox/reader-pipeline`). Danach erscheint im Reader unter »References & tools« ein Deep-Link, der die Markdown-Datei direkt in Obsidian öffnet.

## Produktion

```bash
npm run build
docker build -t reader .
docker compose up -d
```

Reverse Proxy auf `http://reader:3000` bzw. den lokalen Port `3000` zeigen lassen.
