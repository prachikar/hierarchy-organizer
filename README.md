# Hierarchy Organizer

An interactive web app for visualizing and editing a **Platform → Team → Member** hierarchy as a zoomable org chart. It runs entirely in the browser: no server, no build step, no install.

## Features

- Interactive D3 tree with pan, zoom and click-to-collapse branches
- Import data from CSV and export it back to CSV
- Export the chart as a high-resolution PNG
- Add, edit and delete platforms, teams and members from the side panel
- Search with highlighting of matches
- Autosave to the browser's `localStorage`, so data survives a refresh

## Getting started

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8743
```

Then visit <http://localhost:8743>.

Click **Load Sample** for a quick demo, or **Upload CSV** and pick `test-data.csv`.

## CSV format

The first row must be a header. Only `Platform` is required.

| Column        | Description                              |
| ------------- | ---------------------------------------- |
| `Platform`    | Platform name (required)                 |
| `Team`        | Team name; blank members go to "General" |
| `MemberFirst` | Member's first name                      |
| `MemberLast`  | Member's last name                       |
| `Owner`       | Platform owner                           |

```csv
Platform,Team,MemberFirst,MemberLast,Owner
Atlas,Payments,Grace,Hopper,Elena Cruz
Atlas,Fraud,Ada,Lovelace,Elena Cruz
```

Importing merges into the existing chart: platforms and teams with the same name are reused.

## Project files

- `index.html`, `style.css`, `app.js`: the web app
- `test-data.csv`: dummy data (87 rows, with edge cases) for testing
- `hierarchial_organizer.py`: the original Python/matplotlib script

## Notes

- Data lives only in your browser. Use **Export CSV** to back it up or move it elsewhere.
- Excel files must be saved as CSV before uploading.
