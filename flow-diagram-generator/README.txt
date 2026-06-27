FlowForge — Flow Diagram Generator
==================================

WHAT IT IS
----------
A polished, browser-based flow-diagram editor (a focused draw.io / Lucidchart-class
tool). Build flowcharts, swimlane architectures, and decision flows on an SVG surface,
then export to PNG / SVG / PDF. Everything runs locally in your browser — no install,
no server, no account, no internet required.

HOW TO OPEN
-----------
Double-click  index.html
It opens in your default browser using the file:// protocol. No web server needed.

BROWSER REQUIREMENTS
--------------------
Any current browser: Chrome, Edge, Firefox, or Safari.
- Works fully offline. The only external resource is the Google Fonts stylesheet
  (Inter + JetBrains Mono); if it can't load, system fonts are used automatically.
- "Copy image to clipboard" requires a Chromium-based browser (Chrome / Edge).

LOADING THE SAMPLE TEMPLATES
----------------------------
The five starter diagrams in the templates/ folder are also built into the app:

  In the app:  click  New  ->  pick a template card
               (Integration Architecture, Employee Supplier Derivation & Creation,
                Blank Swimlane, Decision Flow, Simple Process)

  From a file: click  Open  ->  choose any templates/*.json file

FILES
-----
  index.html ............. the entire application (self-contained: HTML + CSS + JS)
  USER_MANUAL.html ....... full styled user manual (open in any browser)
  USER_MANUAL.md ......... plain-text version of the manual
  templates/ ............. five sample diagrams in the tool's JSON format
  README.txt ............. this file

SAVING YOUR WORK
----------------
There is no auto-save and nothing is stored in the browser. Use  Save  (Ctrl/Cmd+S)
to download your diagram as a .json file, and  Open  (Ctrl/Cmd+O) to load it back.

QUICK KEYS
----------
  V select   H pan   R process   D decision   T terminator   C connector   N note
  Ctrl/Cmd+Z undo    Ctrl/Cmd+S save    Ctrl/Cmd+O open    Shift+1 fit    ? Help

Press the "? Help" button in the toolbar for the full shortcut list and a quick start.
