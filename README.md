<p align="center"><img src="brand/icon@2x.png" width="128" alt="Flipdown Timer Plus Card"></p>

# Flipdown Timer Plus Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)

Flip-Uhr-Karte für Home Assistant (Lovelace) mit **visuellem Editor** für alle Einstellungen. Unterstützt `timer`, `input_datetime` (Datum + Zeit) und Timestamp-Sensoren (z. B. Alexa-Wecker). Optimiert für `type: sections`.

Inspiriert von [pmongloid/flipdown-timer-card](https://github.com/pmongloid/flipdown-timer-card), neu geschrieben ohne Build-Schritt.

## Installation

**HACS (Custom Repository)**
1. HACS → ⋮ → *Benutzerdefinierte Repositories*
2. Repository `https://github.com/Noack1978/flipdown-timer-plus-card`, Kategorie *Dashboard*
3. Karte installieren und Home Assistant bzw. den Browser-Cache neu laden

**Manuell**
1. `flipdown-timer-plus-card.js` nach `/config/www/` kopieren
2. Einstellungen → Dashboards → ⋮ → Ressourcen: `/local/flipdown-timer-plus-card.js` als *JavaScript-Modul* hinzufügen

## Bedienung

- **Timer im Ruhezustand:** Klick auf die obere Rotorhälfte erhöht die Ziffer, Klick auf die untere verringert sie. *Start* startet mit der angezeigten Zeit, *Zurücksetzen* stellt die Standarddauer wieder her.
- **Läuft:** *Stopp* (Pause) und *Abbrechen*
- **Pausiert:** *Weiter* und *Abbrechen*
- `input_datetime` und Sensoren zeigen den Countdown bis zum Zeitpunkt, ohne Buttons.

## Konfiguration

Alles lässt sich im visuellen Editor einstellen. YAML-Optionen:

| Name | Typ | Beschreibung | Standard |
| --- | --- | --- | --- |
| `type` | string | `custom:flipdown-timer-plus-card` (**erforderlich**) | |
| `entity` | string | `timer`, `input_datetime` (Datum + Zeit) oder Timestamp-Sensor (**erforderlich**) | |
| `name` | string | Titel, falls `show_title: true` (sonst Name der Entität) | |
| `duration` | string | Dauer im Ruhezustand, `hh:mm:ss` | Dauer des Timers |
| `theme` | string | `hass`, `dark`, `light` | `hass` |
| `show_title` | boolean | Titel anzeigen | `false` |
| `show_header` | boolean | Überschriften über den Rotoren | `false` |
| `show_hour` | string | Stundenrotoren: `"true"`, `"false"`, `"auto"` | `"false"` |
| `styles` | object | Darstellung, siehe unten | |
| `localize` | object | Beschriftungen, siehe unten | Sprache von HA |

`show_hour: auto` zeigt HH:MM im Ruhezustand und ab einer Stunde Restzeit, darunter MM:SS.

### styles

| Schlüssel | Beschreibung | Standard |
| --- | --- | --- |
| `space` | Abstand zwischen den Gruppen (Doppelpunkt-Breite) | `20px` |
| `rotor.width` / `rotor.height` | Größe eines Rotors | `50px` / `80px` |
| `rotor.fontsize` | Schriftgröße | `4rem` |
| `rotor.radius` | Eckenradius | `4px` |
| `rotor.background` / `rotor.color` | Farben, überschreiben das Theme | Theme |
| `button.location` | `right`, `bottom`, `hide` | `right` |
| `button.width` | Buttonbreite | `50px` (bottom: Breite von 2 Rotoren) |
| `button.height` | Buttonhöhe (nur bei `bottom`) | `20px` |
| `button.fontsize` | Schriftgröße der Buttons | `1em` |

### localize

```yaml
localize:
  button:
    start: Start
    stop: Stopp
    cancel: Abbrechen
    resume: Weiter
    reset: Zurücksetzen
  header:
    hours: Std
    minutes: Min
    seconds: Sek
```

Das Format des Originals (kommagetrennte Strings, 5 bzw. 3 Werte) funktioniert weiterhin.

## Beispiel

```yaml
type: custom:flipdown-timer-plus-card
entity: timer.kueche
theme: dark
show_title: true
show_header: true
show_hour: auto
duration: "00:10:00"
styles:
  space: 16px
  rotor:
    width: 60px
    height: 90px
    fontsize: 4.5rem
  button:
    location: bottom
```

## Hinweise

- Durch die Flip-Animation kann eine Abweichung von unter 1 s auftreten.
- Die Karte registriert sich zusätzlich in `window.customCards` und erscheint im Karten-Dialog.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
