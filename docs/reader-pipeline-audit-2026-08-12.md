# Reader- und Blog-Pipeline-Audit vom 12. August 2026

## Kurzfassung

Die fehlenden Terry-Tao-Beiträge entstehen vor dem Reader. Der Reader liest alle
Markdown-Dateien unter `reader-pipeline` rekursiv und zeigt die vorhandenen Dateien
korrekt an. Der neu hinzugefügte WordPress-Feed wurde in Miniflux erst am 12. August
um 14:37 MESZ befüllt, während der aktive n8n-Workflow nur einmal täglich um 07:00
lief. Deshalb konnte der Reader diese Einträge noch nicht erhalten.

Zusätzlich hat der neu hinzugefügte Feed die Miniflux-Feed-ID `65`. Der n8n-Workflow
verknüpft Feeds ausschließlich über `blog_sources.miniflux_feed_id`. Falls dort noch
die frühere ID gespeichert ist, liefert der Lookup keine Zeile und der Eintrag endet
vor der Verarbeitung.

## Nachgewiesener Datenstand

- Miniflux-Feed `65` (`What's new`, Terry Tao): 10 ungelesene Einträge.
- Neuester Eintrag: `A partial digestion of the HRT counterexample`, veröffentlicht
  am 6. August 2026.
- Alle 10 Einträge wurden am 12. August gegen 14:37 MESZ erstmals in Miniflux erfasst.
- Reader-Pipeline: 360 Markdown-Dateien, davon 229 in `math_blogs`.
- In `math_blogs` liegen derzeit nur vier ältere Tao-Dateien aus Mai/Juni 2026.

Damit ist ausgeschlossen, dass der Reader die zehn neuen Beiträge durch einen
Quellenfilter oder die Duplikaterkennung versteckt: Die Dateien wurden bislang nicht
nach Nextcloud geschrieben.

## Datenfluss

1. Miniflux sammelt RSS-Einträge und hält sie als `unread` vor.
2. n8n fragt ungelesene Einträge ab und ordnet `feed_id` über `blog_sources` einer
   registrierten Quelle zu.
3. Inhaltsextraktion und LLM erzeugen Volltext, Tags, Zusammenfassung und Score.
4. Der Akzeptanzfilter entscheidet, ob der Eintrag weiterverarbeitet wird.
5. Akzeptierte Einträge werden in Qdrant, Nextcloud und PostgreSQL geschrieben und
   anschließend in Miniflux als gelesen markiert.
6. Der Reader liest Nextcloud/WebDAV rekursiv und baut daraus seine Filteroptionen.

Der Reader fragt Miniflux und PostgreSQL bewusst nicht direkt ab. Eine Datei, die
Schritt 5 nicht erreicht, kann daher in keiner Reader-Ansicht erscheinen.

## Änderungen am n8n-Export

Die lokale Datei `Pipeline_Math_AI_Blogs (6).json` wurde angepasst:

- Zeitplan von täglich 07:00 auf stündlich geändert.
- Miniflux-Batch von 200 auf 1000 ungelesene Einträge erhöht.
- Der Quellen-Lookup kann Feed-ID `65` auf eine vorhandene Terry-/Terence-Tao- oder
  `What's new`-Quellzeile zurückführen, auch wenn deren gespeicherte Feed-ID veraltet
  ist.
- Feed-IDs `45` und `65` sowie namentlich erkannte Tao-Quellen werden unabhängig vom
  LLM-Score akzeptiert. Das LLM bewertet und priorisiert weiterhin, darf Tao-Beiträge
  aber nicht mehr verwerfen.

Der Export ist lokal geändert, aber nicht automatisch in die laufende n8n-Instanz
importiert. Nach dem Import muss der Workflow einmal manuell ausgeführt werden, um
die zehn vorhandenen Einträge sofort abzuarbeiten. Dauerhaft sollte die Quellzeile in
`blog_sources` zusätzlich auf `miniflux_feed_id = 65` aktualisiert werden.

## Änderungen am Reader

- Toolbar in Suche/Navigation, Synchronisationsstatus/Sortierung, Status und weitere
  Filter gegliedert; kein horizontaler Filter-Scrollbar mehr.
- Ergebniszahl `angezeigt von gesamt` ergänzt.
- Quellen, Tags und Ordner zeigen die jeweilige Artikelanzahl.
- Jeder Auswahl-Dialog besitzt `Select all` und `Deselect all`.
- Bei aktiver Dialogsuche wirken die Massenaktionen nur auf die sichtbaren Treffer.
- `All statuses` wählt alle Status aus oder ab; der bisherige Sonderfall, der beim
  Abwählen unbemerkt auf `Unrated` zurücksprang, wurde entfernt.
- Listenbreite auf 880 px erweitert, mobile Titel umbrechen zuverlässig und mobile
  Zeilen zeigen nur die wesentlichen Badges.
- Die virtuelle Liste nutzt die tatsächlich verbleibende Viewport-Höhe statt einer
  festen Annahme über die Toolbar-Höhe.

## Filtersemantik

- Innerhalb einer Gruppe (mehrere Quellen, Tags oder Ordner): ODER.
- Zwischen Gruppen (Status + Quelle + Tag + Ordner + Suche): UND.
- Eine leere Quellen-/Tag-/Ordnerauswahl bedeutet, dass diese Gruppe nicht
  einschränkt. `Deselect all` entfernt somit den betreffenden Filter.
- Eine leere Statusauswahl liefert bewusst keine Artikel.
- Die Duplikaterkennung läuft erst nach Status-, Quellen- und Ordnerfilterung, damit
  kein ungelesener Treffer hinter einer bereits bewerteten Dublette verschwindet.

## Sicherheitsbefund

Der n8n-Export enthält mehrere Zugriffstoken im Klartext, unter anderem für Miniflux,
Qdrant und Telegram. Die Datei ist lokal per `.gitignore` ausgeschlossen und wird
nicht committet. Da mehrere Exportkopien existieren, sollten die betroffenen Tokens
rotiert und anschließend ausschließlich über n8n-Credentials referenziert werden.

## Verifikation

- 75 Unit-Tests bestanden.
- TypeScript-Prüfung ohne Fehler.
- Workflow-Export ist valides JSON; der geänderte Code-Node ist syntaktisch gültig.
- Desktopprüfung bei 1440 x 1000 px.
- Mobilprüfung bei 390 x 844 px ohne horizontales Überlaufen.
- Massenwahl geprüft: 32 Quellen auswählen/abwählen und drei Tao-Quellen über die
  Dialogsuche gemeinsam auswählen.
