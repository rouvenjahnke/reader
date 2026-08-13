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
# optional: zweiter Ordner mit gesternten arXiv-Papern, falls sie ausserhalb der Pipeline liegen
NEXTCLOUD_PAPERS_PATH=/Workstation/Projects/maths/00_inbox/papers/
```

Alle WebDAV-Zugriffe laufen serverseitig über die Next.js API-Routes. Das Frontend bekommt keine Nextcloud-Credentials.

Alle Markdown-Dateien unter `NEXTCLOUD_BASE_PATH` werden rekursiv gelesen. Der erste Unterordner der Pipeline, z. B. `math_blogs`, `ai_blogs`, `ml_papers`, `math_preprints`, wird als `pipelineFolder` erfasst und ist in der Filterleiste unter »Folders« filterbar. Pipeline-Ordner mit `paper` oder `preprint` im Namen sowie Dateien mit Frontmatter `type: paper`/`type: preprint` erhalten zusätzlich die Paper-Kennung. Ist `NEXTCLOUD_PAPERS_PATH` gesetzt, erscheinen auch Markdown-Dateien aus diesem separaten Ordner als Paper.

## Ansichten

- **Liste** (`/`): getrennte Modi für Articles und Papers, jeweils mit eigener Filterbelegung. Articles werden nach Bewertung, Papers nach Arbeitsstatus (`Inbox`, `Skimmed`, `Reading`, `Reference`, `Dismissed`) gefiltert. Suche, Quellen, Tags, Ordner, Dedup und Sortierung gelten passend zum aktiven Modus.
- **Triage** (`/triage`): ein unbewerteter Artikel nach dem anderen — Titel, Metadaten, Textvorschau. Bewerten mit `1`/`2`/`3`, Überspringen mit `→`, Fortschrittszähler.
- **Library** (`/library`): alle als relevant/high bewerteten Artikel, gruppierbar nach Monat, Tag oder Quelle, mit Filter.
- **Reader** (`/article/[id]`): Articles haben die Bewertungsleiste; Papers erhalten eine wissenschaftliche Metadatenansicht, PDF/DOI/BibTeX-Werkzeuge und eine eigene Statusleiste. Notizen, Lesefortschritt und Highlights funktionieren in beiden Modi.
- **Settings** (`/settings`): Präferenzen, Obsidian-Vault-Konfiguration, Pin-Sortierung, Design-Auswahl (Preprint / Terminal / Legibility), Aktivitäts-Heatmap mit Streaks, Shortcut-Übersicht, Sync-Log.
- **Command Palette** (`Ctrl/⌘ K`): Fuzzy-Suche über alle Artikel plus Navigations-, Filter-, Sync- und Theme-Befehle.

## Bedienung

- Artikel öffnen, horizontal wischen oder Pfeiltasten nutzen.
- `1`, `2`, `3` bewerten als irrelevant, relevant, high relevant — in Liste, Reader und Triage.
- Text im Reader markieren und `Markieren` tippen. Die App schreibt den Treffer als Obsidian/Markdown-Highlight `==markierter Text==` zurück in die Markdown-Datei.
- Notizen werden als `reader_note` ins Frontmatter geschrieben; offline erfasste Notizen, Ratings, Highlights, Pins und Paper-Statusänderungen landen in einer Pending-Queue und werden beim nächsten Online-Kontakt synchronisiert.
- Bewusst vorgemerkte Einträge tragen `reader_pinned: true` samt `reader_pinned_by` und `reader_pinned_at`. Der alte numerische Wert `reader_priority` wird nur noch aus historischen Dateien gelesen und nicht mehr für die Sortierung verwendet.
- Im Paper-Modus lassen sich die vom Watched-Authors-Workflow erkannten Personen und Themen getrennt durchsuchen und als Filter kombinieren.

## Scoring und n8n

Die Pipeline zeigt nur noch einen Score von 0 bis 10:

```text
score = 0.85 * content_score + 0.15 * source_priority
```

Die Quellenpriorität beeinflusst damit die Reihenfolge leicht, erzeugt aber keinen eigenen Rang und niemals automatisch einen Pin. OpenClaw oder der Benutzer können interessante Einträge explizit pinnen. Bereinigte n8n-Templates, die Watchlist-Migration und die Installationsschritte stehen unter [`n8n/`](n8n/README.md).

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

## Terry-Tao-Pipeline diagnostizieren

Das rein lesende Diagnosewerkzeug verfolgt Terry-Tao-Einträge durch Miniflux,
den aktiven n8n-Workflow samt Ausführungen, `blog_sources`, `math_articles`,
Nextcloud/WebDAV und die Reader-API. Es schreibt keine Daten in diese Systeme und
gibt keine Zugangsdaten in den Bericht aus.

Für die vollständige Datenbankprüfung eine separate PostgreSQL-Rolle mit nur
`SELECT`-Rechten verwenden:

```bash
cp .env.debug.example .env.debug
# DATABASE_URL in .env.debug eintragen
npm run debug:tao
```

Gezielt den derzeit fehlenden Artikel prüfen:

```bash
npm run debug:tao -- --entry-id 16451
```

Der Bericht wird nach `debug-output/terence-tao-report.json` geschrieben. Die
wichtigsten Ergebnisstufen sind:

| Stufe | Bedeutung |
| --- | --- |
| `SOURCE_NOT_REGISTERED` | Feed-ID ist nicht aktiv in `blog_sources` registriert. |
| `SOURCE_ID_STALE_WORKFLOW_FALLBACK_REQUIRED` | Tao-Quelle existiert, hat aber eine andere Miniflux-Feed-ID. |
| `WAITING_OR_WORKFLOW_FAILED_BEFORE_NEXTCLOUD` | Miniflux-Eintrag ist ungelesen, aber DB und Datei fehlen. |
| `NO_N8N_EXECUTION_FOR_ENTRY` | Keine der geprüften aktiven n8n-Ausführungen enthält den Eintrag. |
| `N8N_EXECUTION_FAILED` | Eine passende n8n-Ausführung ist an einem gemeldeten Knoten fehlgeschlagen. |
| `N8N_FINISHED_WITHOUT_ARTIFACT` | n8n meldet Erfolg, erzeugte aber weder DB-Zeile noch Datei. |
| `MARKED_READ_WITHOUT_ARTIFACT` | Eintrag wurde konsumiert, ohne DB-Zeile oder Datei zu erzeugen. |
| `NEXTCLOUD_FILE_WITHOUT_DATABASE_ROW` | WebDAV-Schreibvorgang gelang, PostgreSQL-Insert nicht. |
| `DATABASE_ROW_WITHOUT_NEXTCLOUD_FILE` | DB-Zeile existiert, WebDAV-Datei fehlt. |
| `NEXTCLOUD_FILE_NOT_IN_READER_API` | Datei existiert, wird aber vom Reader nicht eingelesen. |
| `OK` | Eintrag ist in allen geprüften Stufen vorhanden. |

Mit `npm run debug:tao -- --help` werden alle Filteroptionen angezeigt. Für die
Reader-Prüfung lokal zuerst `npm run dev` starten oder in `.env.debug` eine
erreichbare `READER_URL` eintragen.
