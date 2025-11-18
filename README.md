# MangaEditorPro - Web Edition

Accurate web conversion of the original tool.

## Files
- index.html - Entry point
- style.css - Styling
- app.js - Application logic

## Features
- Folder selection (webkitdirectory)
- Proper numeric sorting (01.jpg < 02.jpg < 10.jpg)
- Canvas image viewer with pan/zoom
- Line-by-line tagging
- Tag extraction from detected_text.txt
- Complete export functionality

## Usage
1. Upload all files to your host
2. Open index.html
3. Click "Open Folder" to select manga folder
4. Load text file or type manually
5. Click line numbers to select, apply tags
6. Save: detected_text.txt + project.json

## Keyboard
- Ctrl+O: Open folder
- Ctrl+S: Save
- Ctrl+T: Load text
- Tab: Toggle tagging mode
- 1-9: Apply tags (when mode ON)
