# Drivo-Karte

Dieser Branch baut die Hintergrundkarte (Straßen und Flüsse) für die App Drivo.
Er hat keine gemeinsame Geschichte mit dem Rest des Repos und kann jederzeit gelöscht werden.

- `make_tiles.py` liest Linien aus einem OpenStreetMap-Auszug, verbindet und vereinfacht sie (7 m Straßen, 9 m Wasser)
  und schneidet sie in Kacheln im Regionsraster der App (0,06° × 0,09°), gebündelt zu Paketen aus 8 × 6 Kacheln.
- Der Workflow `.github/workflows/drivo-karte.yml` lädt den Deutschland-Auszug von Geofabrik, filtert
  Autobahnen bis Kreisstraßen sowie Flüsse und Kanäle und legt das Ergebnis als `drivo-osm.tar.gz` hier ab.

Daten: © OpenStreetMap-Mitwirkende, Open Database License (ODbL).
