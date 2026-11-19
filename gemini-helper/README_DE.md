# Gemini-helper

[![GitHub](https://img.shields.io/badge/GitHub-urzeye%2Ftampermonkey--scripts-blue?style=flat-square&logo=github)](https://github.com/urzeye/tampermonkey-scripts)

> [!CAUTION]
> **Gemini Helper Funktionsupdates eingestellt**
>
> Dieses Projekt wurde als **[Ophel](https://github.com/urzeye/ophel)** neu aufgebaut – komplett neu geschrieben mit modernem Tech-Stack, besserer Leistung und mehr Funktionen. Unterstützt sowohl Browser-Erweiterung als auch Userscript.
>
> Wir empfehlen dringend den Wechsel zu **Ophel** für das beste Erlebnis:
>
> - [GitHub Repository](https://github.com/urzeye/ophel)
> - [Chrome](https://chromewebstore.google.com/detail/ophel-ai-%E5%AF%B9%E8%AF%9D%E5%A2%9E%E5%BC%BA%E5%B7%A5%E5%85%B7/lpcohdfbomkgepfladogodgeoppclakd)
> - [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/ophel-ai-chat-enhancer)
> - [GreasyFork Installation](https://greasyfork.org/zh-CN/scripts/563646-ophel)
>
> Dieses Skript wird nur noch grundlegend gewartet.

<p align="center">
  <strong>✨ Your Gemini, Your Way. ✨</strong><br/>
  <em>Gestalte dein eigenes Gemini</em>
</p>

> [!TIP]
> **Gemini Helfer**: Konversationsverwaltung & Export, Gliederungsnavigation, Prompt-Verwaltung, Tab-Erweiterungen (Status/Datenschutz/Benachrichtigung), Leseverlauf & Wiederherstellung, bidirektionaler/manueller Anker, Bildwasserzeichen-Entfernung, Fettschrift-Fix, Formel/Tabellen-Kopie, Modellsperre, Seitenverschönerung, Theme-Wechsel, Smart Dark Mode (Gemini/Gemini Enterprise)

🌐 **Sprache**: [简体中文](README.md) | [English](README_EN.md) | [日本語](README_JA.md) | [한국어](README_KO.md) | **Deutsch** | [Français](README_FR.md) | [Español](README_ES.md) | [Português](README_PT.md) | [Русский](README_RU.md)

## ✨ Funktionen

### 📝 Prompt-Verwaltung

- **Schnelles Einfügen**: Häufig verwendete Prompts mit einem Klick in den Chat einfügen
- **Kategorieverwaltung**: Kategorien filtern, umbenennen und löschen
- **Suchfunktion**: Schnell benötigte Prompts finden
- **CRUD-Operationen**: Prompt-Bibliothek anpassen und verwalten
- **Kopierfunktion**: Prompt-Inhalt mit einem Klick in die Zwischenablage kopieren
- **Drag & Sort**: Anzeigereihenfolge der Prompts frei anpassen

### 📁 Konversationsverwaltung

- **Ordner-Archiv**: Benutzerdefinierte Ordner erstellen, um Chat-Verlauf zu organisieren
- **Mehrfarbige Tags**: 30+ traditionelle chinesische Farben, unterstützt benutzerdefinierte Farben und Multi-Tag-Verwaltung
- **Echtzeit-Suche**: Schnelles Filtern nach Titel, unterstützt Tag-Kombinationsfilterung
- **Stapeloperationen**: Mehrfachauswahl für Stapellöschung, Verschieben und Archivieren
- **Konversation exportieren**: Export in Markdown/JSON/TXT-Format, Bilder können in Base64 konvertiert werden
- **Nahtlose Synchronisierung**: Automatische Synchronisierung der neuesten Daten aus der Gemini-Seitenleiste (kompatibel mit Standard/Enterprise)

### 📑 Gliederungsnavigation

- **Automatische Extraktion**: Überschriftenstruktur aus KI-Antworten extrahieren (unterstützt Standard und Enterprise Shadow DOM)
- **Benutzeranfragen-Gruppierung**: Gliederung nach Konversationsrunden gruppieren, Benutzeranfragen als Gruppenkopfzeilen (💬 Symbol)
- **Intelligente Einrückung**: Automatische Einrückungsanpassung basierend auf höchster Ebene zur Reduzierung des linken Leerraums
- **Schnellsprung**: Klick auf Gliederungselement für sanftes Scrollen und 2-Sekunden-Hervorhebung
- **Synchronisiertes Scrollen**: Automatische Hervorhebung des entsprechenden Gliederungselements beim Seitenscroll (in Einstellungen umschaltbar)
- **Ebenenfilter**: Überschriftenebene-Anzeige einstellen, Ebene 0 für schnelles Zusammenfalten nur auf Benutzeranfragen
- **Umschaltsteuerung**: Automatisches Ausblenden des Gliederungs-Tabs bei Deaktivierung

### 🚀 Schnellnavigation

- **Zum Anfang/Ende springen**: Schnelle Positionierung in langen Konversationen
- **Schwebende Schaltflächengruppe**: Auch bei zugeklapptem Panel zugänglich

### 📐 Seitenbreite

- **Benutzerdefinierte Breite**: Unterstützt sowohl Pixel (px) als auch Prozent (%) Einheiten
- **Sofortige Anwendung**: Sofort nach Anpassung anwenden, kein Aktualisieren nötig
- **Unabhängige Konfiguration**: Unterschiedliche Einstellungen für verschiedene Seiten

### ⚓ Intelligentes Positionierungssystem

Zwei unabhängige Positionsaufzeichnungssysteme:

- **Leseverlauf (Reading Progress)**:
  - Langfristiges "Lesefortschritts-Gedächtnis", unterstützt Wiederherstellung über Aktualisierungen/Sitzungen hinweg
  - Automatische Aufzeichnung beim Scrollen, persistent in GM_storage
  - Automatische Wiederherstellung beim Laden der Seite oder Konversationswechsel

- **Bidirektionaler Anker**:
  - Kurzfristiger "Rückkehrpunkt", ähnlich wie Browser-Zurück oder `git switch -`
  - Automatisches Speichern der aktuellen Position beim Klicken auf Gliederung/Anfang/Ende-Schaltflächen
  - Unterstützt Hin-und-Her-Wechsel zwischen zwei Positionen

### 🏷️ Tab-Erweiterungen

- **Generierungsstatus-Anzeige**: Automatische Anzeige von ⏳ (generierend) oder ✅ (fertig) Status-Symbol im Tab-Titel
- **Benutzerdefiniertes Titelformat**: Unterstützt `{status}{title}[{model}]` Platzhalter-Kombinationen
- **Datenschutzmodus (Boss-Taste)**: Tab-Titel mit einem Klick als "Google" tarnen, Konversationsinhalt verbergen
- **Abschlussbenachrichtigung**: Desktop-Benachrichtigung senden, wenn Hintergrundgenerierung abgeschlossen ist
- **Automatischer Fensterfokus**: Browserfenster automatisch in den Vordergrund bringen, wenn Generierung abgeschlossen ist

### ⚙️ Einstellungspanel

- **Tab-Wechsel**: Drei Tabs - Prompts, Gliederung, Einstellungen
- **Panel-Einstellungen**: Standard-Erweitern/Zuklappen anpassen, automatisches Ausblenden bei Klick außerhalb
- **Chinesische Eingabe-Fix**: Optionaler Schalter zur Behebung des Erstzeichen-Problems in Enterprise
- **Sprachwechsel**: Unterstützt Vereinfachtes Chinesisch/Traditionelles Chinesisch/Englisch

### 🎯 Intelligente Anpassung

- ✅ Gemini Standard (gemini.google.com)
- ✅ Gemini Enterprise (business.gemini.google)

### 🌓 Automatischer Dark Mode

- **Intelligente Erkennung**: Echtzeit-Verfolgung von System-/Seiten-Hell-/Dunkel-Modus-Umschaltung
- **Volle Anpassung**: Sorgfältig abgestimmtes Dark-Theme-Farbschema, augenschonend

### 📋 Inhaltsunterstützung

- **Formel-Doppelklick-Kopie**: Doppelklick auf mathematische Formel zum Kopieren von LaTeX-Quelle, automatisches Hinzufügen von Trennzeichen
- **Tabellen-Markdown-Kopie**: Kopierschaltfläche oben rechts an Tabelle hinzufügen, direktes Kopieren im Markdown-Format
- **Wasserzeichen-Entfernung**: Automatisches Entfernen des NanoBanana-Wasserzeichens von Gemini-KI-generierten Bildern
- **Randeinrastung**: Automatisches Ausblenden beim Ziehen des Panels zum Bildschirmrand, Anzeigen bei Hover
- **Manueller Anker**: Ankerposition setzen/zurückkehren/löschen mit Schnellzugriffs-Symbolleiste

## 📸 Vorschau

**📹 Video-Demo**:

| Gliederung | Konversationen | Funktionen |
|:---:|:---:|:---:|
| <video src="https://github.com/user-attachments/assets/a40eb655-295e-4f9c-b432-9313c9242c9d" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/a249baeb-2e82-4677-847c-2ff584c3f56b" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/c704463c-1ca9-4ab1-937d-7ce638a4f4bb" width="280" controls></video> |

 ![Konversationen](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-7.png) ![Konversationen](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-8.png) ![Gliederung](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-2.png) ![Prompts](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-1.png) ![Lesenavigation](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-3.png) ![Tab-Erweiterung](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-4.png) ![Theme-Wechsel](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-theme.gif) ![Dunkelmodus](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-9.png) ![Dunkelmodus](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-10.png) ![Dunkelmodus](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-11.png) ![Dunkelmodus](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-12.png) ![Andere Einstellungen](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-5.png)

## 🔧 Verwendung

1. Tampermonkey-Browsererweiterung installieren
2. Dieses Skript installieren
3. Gemini-Seite öffnen, Prompt-Verwaltungspanel erscheint auf der rechten Seite
4. Auf Prompt klicken zum schnellen Einfügen

## ⌨️ Schnelloperationen

| Operation | Beschreibung |
| --- | --- |
| Prompt anklicken | In Eingabefeld einfügen |
| 📋 Kopieren-Schaltfläche | Prompt-Inhalt kopieren |
| ☰ Ziehgriff | Ziehen zum Anpassen der Reihenfolge |
| ✏ Bearbeiten-Schaltfläche | Prompt bearbeiten |
| 🗑 Löschen-Schaltfläche | Prompt löschen |
| ⚙ Kategorieverwaltung | Kategorie umbenennen/löschen |
| × Schaltfläche anklicken | Eingefügten Inhalt löschen |
| Enter zum Senden | Schwebende Leiste automatisch ausblenden |
| ⬆ / ⬇ Schaltflächen | Zum Seitenanfang/-ende springen |

## 🐛 Feedback

Bei Problemen oder Vorschlägen geben Sie bitte Feedback unter [GitHub Issues](https://github.com/urzeye/tampermonkey-scripts/issues)

## 📄 Lizenz

MIT License
