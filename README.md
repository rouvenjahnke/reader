# Reader

Single-user PWA zum Lesen, Markieren und Bewerten von Markdown-Notizen aus Nextcloud.

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
NEXTCLOUD_BASE_PATH=/Reader-Pipeline/
```

Alle WebDAV-Zugriffe laufen serverseitig über die Next.js API-Routes. Das Frontend bekommt keine Nextcloud-Credentials.

## Bedienung

- Liste filtern nach Status, Quelle, Suche und Sortierung.
- Artikel öffnen, horizontal wischen oder Pfeiltasten nutzen.
- `1`, `2`, `3` bewerten als irrelevant, relevant, high relevant.
- Text im Reader markieren und `Markieren` tippen. Die App schreibt den Treffer als Obsidian/Markdown-Highlight `==markierter Text==` zurück in die Markdown-Datei.

## Produktion

```bash
npm run build
docker build -t reader .
docker compose up -d
```

Reverse Proxy auf `http://reader:3000` bzw. den lokalen Port `3000` zeigen lassen.
