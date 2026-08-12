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

- **Liste** (`/`): filterbar nach Status, Quelle, Tags, Pipeline-Ordner, Suche (inkl. Volltext im lokalen Cache) und Sortierung. Dedup, »Neu heute«-, Paper- und Galois-Filter.
- **Triage** (`/triage`): ein unbewerteter Artikel nach dem anderen — Titel, Metadaten, Textvorschau. Bewerten mit `1`/`2`/`3`, Überspringen mit `→`, Fortschrittszähler.
- **Library** (`/library`): alle als relevant/high bewerteten Artikel, gruppierbar nach Monat, Tag oder Quelle, mit Filter.
- **Reader** (`/article/[id]`): Inhaltsverzeichnis (`c`), Notiz pro Artikel (`n`, wird ins Frontmatter geschrieben), References & Tools (arXiv abs/PDF, BibTeX- und Zitat-Copy, Obsidian-Deep-Link), Lesefortschritt, Highlights.
- **Settings** (`/settings`): Präferenzen, Obsidian-Vault-Konfiguration, Papers-Sichtbarkeit, Design-Auswahl (Preprint / Terminal / Legibility), Aktivitäts-Heatmap mit Streaks, Shortcut-Übersicht, Sync-Log.
- **Command Palette** (`Ctrl/⌘ K`): Fuzzy-Suche über alle Artikel plus Navigations-, Filter-, Sync- und Theme-Befehle.

## Bedienung

- Artikel öffnen, horizontal wischen oder Pfeiltasten nutzen.
- `1`, `2`, `3` bewerten als irrelevant, relevant, high relevant — in Liste, Reader und Triage.
- Text im Reader markieren und `Markieren` tippen. Die App schreibt den Treffer als Obsidian/Markdown-Highlight `==markierter Text==` zurück in die Markdown-Datei.
- Notizen werden als `reader_note` ins Frontmatter geschrieben; offline erfasste Notizen, Ratings und Highlights landen in einer Pending-Queue und werden beim nächsten Online-Kontakt synchronisiert.
- Optionales Frontmatter für bewusst vorgemerkte Artikel: `reader_priority: 200` oder `reader_pinned: true` — wird quellenunabhängig nach oben sortiert (abschaltbar unter Settings → »Pin priority on top«).

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
