const S = {
    pages: [],
    idx: -1,
    tagMode: false,
    selected: new Set(),
    tags: {},
    img: null,
    canvas: null,
    ctx: null,
    zoom: 1,
    rotation: 0,
    panX: 0,
    panY: 0,
    panning: false,
    lastX: 0,
    lastY: 0,
    fitMode: 'width'
};

const TAGS = {
    '1': '""', '2': '()', '3': '::', '4': 'OT:', '5': 'ST:',
    '6': 'SFX:', '7': '//', '8': '[]', '9': '--', '0': ''
};

function numSort(a, b) {
    const re = /(\d+)|(\D+)/g;
    const ap = [], bp = [];
    let m;
    while ((m = re.exec(a))) ap.push(m[1] ? +m[1] : m[2]);
    re.lastIndex = 0;
    while ((m = re.exec(b))) bp.push(m[1] ? +m[1] : m[2]);
    for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
        if (typeof ap[i] === 'number' && typeof bp[i] === 'number') {
            if (ap[i] !== bp[i]) return ap[i] - bp[i];
        } else {
            const c = String(ap[i]).localeCompare(String(bp[i]));
            if (c !== 0) return c;
        }
    }
    return ap.length - bp.length;
}

document.addEventListener('DOMContentLoaded', init);

function init() {
    S.canvas = document.getElementById('imageCanvas');
    S.ctx = S.canvas.getContext('2d');
    
    const ta = document.getElementById('textArea');
    ta.addEventListener('input', updateOutput);
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('keydown', handleKey);
    ta.addEventListener('click', updateCursor);
    ta.addEventListener('keyup', updateCursor);
    
    document.getElementById('wrapText').addEventListener('change', e => {
        ta.classList.toggle('wrap', e.target.checked);
    });
    
    S.canvas.addEventListener('mousedown', panStart);
    S.canvas.addEventListener('mousemove', panMove);
    S.canvas.addEventListener('mouseup', panEnd);
    S.canvas.addEventListener('mouseleave', panEnd);
    S.canvas.addEventListener('wheel', wheel);
    
    const resizer = document.querySelector('.resizer');
    const editorSection = document.querySelector('.editor-section');
    const outputSection = document.querySelector('.output-section');
    let isResizing = false;
    
    resizer.addEventListener('mousedown', e => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const containerRect = document.querySelector('.split-container').getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const percentage = (newWidth / containerRect.width) * 100;
        if (percentage > 20 && percentage < 80) {
            editorSection.style.flex = `0 0 ${percentage}%`;
            outputSection.style.flex = `0 0 ${100 - percentage}%`;
        }
    });
    
    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = 'default';
    });
    
    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'o') { e.preventDefault(); openFolder(); }
            else if (e.key === 's') { e.preventDefault(); saveProject(); }
            else if (e.key === 't') { e.preventDefault(); loadTextFile(); }
        } else if (e.altKey) {
            if (e.key === 'ArrowLeft') { e.preventDefault(); prevPage(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); nextPage(); }
        } else if (e.key === 'Home' && e.target.tagName !== 'TEXTAREA') firstPage();
        else if (e.key === 'End' && e.target.tagName !== 'TEXTAREA') lastPage();
    });
    
    if (!localStorage.getItem('mangaEditorWelcomeShown')) {
        localStorage.setItem('mangaEditorWelcomeShown', 'true');
    } else {
        closeWelcome();
    }
}

function closeWelcome() {
    document.getElementById('welcomeModal').style.display = 'none';
}

function showHelp() {
    document.getElementById('helpModal').style.display = 'flex';
}

function closeHelp() {
    document.getElementById('helpModal').style.display = 'none';
}

function openFolder() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.webkitdirectory = true;
    inp.multiple = true;
    inp.onchange = e => {
        const files = Array.from(e.target.files)
            .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f.name))
            .sort((a, b) => numSort(a.name, b.name));
        loadImages(files);
    };
    inp.click();
}

function loadImages(files) {
    S.pages = [];
    let done = 0;
    files.forEach(f => {
        const r = new FileReader();
        r.onload = e => {
            S.pages.push({
                name: f.name,
                url: e.target.result,
                text: '',
                tags: {},
                hasText: false
            });
            if (++done === files.length) {
                S.pages.sort((a, b) => numSort(a.name, b.name));
                updateNav();
                if (S.pages.length) loadPage(0);
                status(`Loaded ${S.pages.length} pages`);
            }
        };
        r.readAsDataURL(f);
    });
}

function loadTextFile() {
    if (!S.pages.length) { alert('Load images first'); return; }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.txt';
    inp.onchange = e => {
        const r = new FileReader();
        r.onload = ev => parseText(ev.target.result);
        r.readAsText(e.target.files[0]);
    };
    inp.click();
}

function parseText(txt) {
    if (tryDetectedFormat(txt)) return;
    if (tryMultiFormat(txt)) return;
    if (S.idx >= 0) {
        S.pages[S.idx].text = txt;
        S.pages[S.idx].hasText = true;
        document.getElementById('textArea').value = txt;
        updateOutput();
        updateNav();
        status('Text loaded to current page');
    }
}

function tryDetectedFormat(txt) {
    const byName = {}, tagsByName = {};
    const lines = txt.split('\n');
    const validTags = ['""', '()', '::', 'OT:', 'ST:', 'SFX:', '//', '[]', '--'];
    let curr = null, currText = [], currTags = {}, lineNum = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fm = line.match(/^([\w\-\.]+\.(jpe?g|png|gif|webp)):?\s*$/i);
        if (fm) {
            if (curr && currText.length > 0) {
                let textContent = currText.join('\n');
                if (document.getElementById('autoSpace').checked) {
                    textContent = applyAutoSpacing(textContent);
                }
                byName[curr] = textContent;
                tagsByName[curr] = {...currTags};
            }
            curr = fm[1];
            currText = [];
            currTags = {};
            lineNum = 0;
            continue;
        }
        if (curr) {
            lineNum++;
            let proc = line;
            let foundTag = false;
            for (let tag of validTags) {
                if (line.startsWith(tag + ' ')) {
                    currTags[lineNum] = tag;
                    proc = line.substring(tag.length + 1);
                    foundTag = true;
                    break;
                }
            }
            currText.push(proc);
        }
    }
    if (curr && currText.length > 0) {
        let textContent = currText.join('\n');
        if (document.getElementById('autoSpace').checked) {
            textContent = applyAutoSpacing(textContent);
        }
        byName[curr] = textContent;
        tagsByName[curr] = {...currTags};
    }
    
    if (Object.keys(byName).length > 0) {
        let matched = 0, tagCount = 0;
        for (let pg of S.pages) {
            if (byName[pg.name]) {
                pg.text = byName[pg.name];
                pg.hasText = true;
                if (tagsByName[pg.name]) {
                    pg.tags = tagsByName[pg.name];
                    tagCount += Object.keys(pg.tags).length;
                }
                matched++;
            }
        }
        if (matched > 0) {
            if (S.idx >= 0) {
                const pg = S.pages[S.idx];
                document.getElementById('textArea').value = pg.text || '';
                S.tags = {...(pg.tags || {})};
                updateOutput();
            }
            updateNav();
            status(`Loaded ${matched} pages, ${tagCount} tags`);
            return true;
        }
    }
    return false;
}

function tryMultiFormat(txt) {
    const pats = [
        /(?:PAGE|Image)[\s:]*(\d+)[^\n]*\n(.*?)(?=(?:PAGE|Image)[\s:]*\d+|$)/gi,
        /\[(?:PAGE|Image)[\s:]*(\d+)\][^\n]*\n(.*?)(?=\[(?:PAGE|Image)[\s:]*\d+\]|$)/gi
    ];
    for (let pat of pats) {
        const ms = [...txt.matchAll(pat)];
        if (ms.length) {
            for (let m of ms) {
                const n = +m[1] - 1;
                if (n >= 0 && n < S.pages.length) {
                    S.pages[n].text = m[2].trim();
                    S.pages[n].hasText = true;
                }
            }
            if (S.idx >= 0) loadPage(S.idx);
            updateNav();
            status('Multi-page text loaded');
            return true;
        }
    }
    return false;
}

function updateNav() {
    const list = document.getElementById('pagesList');
    list.innerHTML = '';
    S.pages.forEach((pg, i) => {
        const div = document.createElement('div');
        div.className = 'page-item';
        if (pg.hasText) div.classList.add('has-text');
        if (i === S.idx) div.classList.add('active');
        div.textContent = `PAGE ${i + 1}`;
        div.onclick = () => loadPage(i);
        list.appendChild(div);
    });
}

function loadPage(i) {
    if (i < 0 || i >= S.pages.length) return;
    if (S.idx >= 0) {
        S.pages[S.idx].text = document.getElementById('textArea').value;
        S.pages[S.idx].tags = {...S.tags};
        S.pages[S.idx].hasText = S.pages[S.idx].text.trim().length > 0;
    }
    S.idx = i;
    const pg = S.pages[i];
    loadImg(pg.url);
    document.getElementById('textArea').value = pg.text || '';
    S.tags = {...(pg.tags || {})};
    S.selected.clear();
    updateOutput();
    updateNav();
    document.getElementById('pageLabel').textContent = `PAGE ${i + 1} / ${S.pages.length}`;
    status(`PAGE ${i + 1}`);
}

function firstPage() { if (S.pages.length) loadPage(0); }
function prevPage() { if (S.idx > 0) loadPage(S.idx - 1); }
function nextPage() { if (S.idx < S.pages.length - 1) loadPage(S.idx + 1); }
function lastPage() { if (S.pages.length) loadPage(S.pages.length - 1); }

function loadImg(url) {
    const img = new Image();
    img.onload = () => {
        S.img = img;
        S.rotation = 0;
        S.panX = 0;
        S.panY = 0;
        fitWidth();
        document.getElementById('imageInfo').textContent = `${img.width} x ${img.height}`;
    };
    img.src = url;
}

function fitWidth() {
    if (!S.img) return;
    S.fitMode = 'width';
    const w = document.getElementById('canvasWrapper').clientWidth;
    S.zoom = w / S.img.width;
    render();
    setActive('fitWidthBtn');
}

function fitHeight() {
    if (!S.img) return;
    S.fitMode = 'height';
    const h = document.getElementById('canvasWrapper').clientHeight;
    S.zoom = h / S.img.height;
    render();
    setActive('fitHeightBtn');
}

function fitAll() {
    if (!S.img) return;
    S.fitMode = 'fit';
    const wrap = document.getElementById('canvasWrapper');
    const sw = wrap.clientWidth / S.img.width;
    const sh = wrap.clientHeight / S.img.height;
    S.zoom = Math.min(sw, sh);
    render();
    setActive('fitAllBtn');
}

function actualSize() {
    if (!S.img) return;
    S.fitMode = 'actual';
    S.zoom = 1;
    render();
    setActive('actualBtn');
}

function zoomIn() {
    S.zoom *= 1.2;
    S.fitMode = 'manual';
    render();
}

function zoomOut() {
    S.zoom /= 1.2;
    S.fitMode = 'manual';
    render();
}

function rotateRight() {
    S.rotation = (S.rotation + 90) % 360;
    render();
}

function rotateLeft() {
    S.rotation = (S.rotation - 90 + 360) % 360;
    render();
}

function resetView() {
    S.rotation = 0;
    S.panX = 0;
    S.panY = 0;
    fitWidth();
}

function setActive(id) {
    ['fitWidthBtn', 'fitHeightBtn', 'fitAllBtn', 'actualBtn'].forEach(bid => {
        document.getElementById(bid).classList.toggle('active', bid === id);
    });
}

function render() {
    if (!S.img) return;
    const rad = S.rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = S.img.width * cos + S.img.height * sin;
    const h = S.img.width * sin + S.img.height * cos;
    
    const wrap = document.getElementById('canvasWrapper');
    const minW = wrap.clientWidth;
    const minH = wrap.clientHeight;
    
    S.canvas.width = Math.max(w * S.zoom, minW);
    S.canvas.height = Math.max(h * S.zoom, minH);
    
    S.ctx.clearRect(0, 0, S.canvas.width, S.canvas.height);
    S.ctx.save();
    S.ctx.translate(S.canvas.width / 2 + S.panX, S.canvas.height / 2 + S.panY);
    S.ctx.rotate(rad);
    S.ctx.drawImage(S.img, -S.img.width * S.zoom / 2, -S.img.height * S.zoom / 2,
                    S.img.width * S.zoom, S.img.height * S.zoom);
    S.ctx.restore();
    document.getElementById('zoomText').textContent = Math.round(S.zoom * 100) + '%';
}

function panStart(e) {
    if (!S.img) return;
    S.panning = true;
    S.lastX = e.clientX;
    S.lastY = e.clientY;
}

function panMove(e) {
    if (!S.panning) return;
    S.panX += e.clientX - S.lastX;
    S.panY += e.clientY - S.lastY;
    S.lastX = e.clientX;
    S.lastY = e.clientY;
    render();
}

function panEnd() {
    S.panning = false;
}

function wheel(e) {
    e.preventDefault();
    if (!S.img) return;
    S.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
    S.fitMode = 'manual';
    render();
}

function applyAutoSpacing(text) {
    if (!document.getElementById('autoSpace').checked) return text;
    
    const lines = text.split('\n');
    const result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i];
        const nextLine = lines[i + 1];
        
        result.push(currentLine);
        
        // Add spacing only if:
        // 1. Current line has content
        // 2. Next line exists and has content
        // 3. There isn't already a blank line after current line
        if (currentLine.trim() && nextLine !== undefined && nextLine.trim() && i + 1 < lines.length) {
            // Check if next line is not already blank
            if (lines[i + 1] !== '') {
                result.push('');
            }
        }
    }
    
    return result.join('\n');
}

function updateOutput() {
    const txt = document.getElementById('textArea').value;
    const lines = txt.split('\n');
    
    const nums = document.getElementById('lineNumbers');
    nums.innerHTML = '';
    lines.forEach((_, i) => {
        const n = i + 1;
        const div = document.createElement('div');
        div.className = 'line-num';
        div.textContent = n;
        div.onclick = e => toggleLine(n, e.ctrlKey);
        if (S.selected.has(n)) div.classList.add('selected');
        if (S.tags[n]) div.classList.add('tagged');
        nums.appendChild(div);
    });
    
    const onums = document.getElementById('outputNums');
    const otxt = document.getElementById('outputText');
    onums.innerHTML = '';
    otxt.innerHTML = '';
    
    lines.forEach((line, i) => {
        const n = i + 1;
        const ndiv = document.createElement('div');
        ndiv.className = 'line-num';
        ndiv.textContent = n;
        onums.appendChild(ndiv);
        
        const ldiv = document.createElement('div');
        ldiv.className = 'output-line';
        const tag = S.tags[n];
        if (tag) {
            ldiv.classList.add('tagged');
            ldiv.textContent = tag + ' ' + line;
        } else {
            ldiv.textContent = line;
        }
        otxt.appendChild(ldiv);
    });
    
    updateSelected();
    updateStats();
}

function syncScroll() {
    if (!document.getElementById('syncScroll').checked) return;
    const ta = document.getElementById('textArea');
    document.getElementById('lineNumbers').scrollTop = ta.scrollTop;
    document.getElementById('outputNums').scrollTop = ta.scrollTop;
    document.getElementById('outputText').scrollTop = ta.scrollTop;
}

function toggleLine(n, ctrl) {
    if (ctrl && S.selected.size) {
        const last = Math.max(...S.selected);
        const start = Math.min(last, n);
        const end = Math.max(last, n);
        for (let i = start; i <= end; i++) S.selected.add(i);
    } else {
        S.selected.has(n) ? S.selected.delete(n) : S.selected.add(n);
    }
    updateOutput();
}

function updateSelected() {
    const info = document.getElementById('selectedInfo');
    if (S.selected.size) {
        const arr = Array.from(S.selected).sort((a, b) => a - b);
        info.textContent = arr.length > 10 ?
            `${arr.slice(0, 3).join(',')}...${arr.slice(-3).join(',')} (${arr.length})` :
            arr.join(', ');
        info.style.color = 'var(--primary)';
    } else {
        info.textContent = 'Click line numbers to select';
        info.style.color = 'var(--text-muted)';
    }
}

function updateCursor() {
    const ta = document.getElementById('textArea');
    const pos = ta.selectionStart;
    const txt = ta.value.substring(0, pos);
    const ln = txt.split('\n').length;
    const col = pos - txt.lastIndexOf('\n');
    document.getElementById('cursorPos').textContent = `Ln ${ln}, Col ${col}`;
}

function toggleTagMode() {
    S.tagMode = !S.tagMode;
    const btn = document.getElementById('tagModeBtn');
    btn.textContent = S.tagMode ? 'ON' : 'OFF';
    btn.className = S.tagMode ? 'tag-mode-on' : 'tag-mode-off';
}

function handleKey(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        toggleTagMode();
        return;
    }
    if (S.tagMode && TAGS[e.key]) {
        e.preventDefault();
        insertTag(TAGS[e.key]);
    }
}

function insertTag(tag) {
    const ta = document.getElementById('textArea');
    const pos = ta.selectionStart;
    const txt = ta.value;
    const before = txt.substring(0, pos);
    const n = before.split('\n').length;
    
    if (tag) S.tags[n] = tag;
    else delete S.tags[n];
    
    updateOutput();
    
    const lines = txt.split('\n');
    if (n < lines.length) {
        const nextPos = before.length + lines[n - 1].length + 1;
        ta.selectionStart = ta.selectionEnd = Math.min(nextPos, txt.length);
        ta.focus();
    }
}

function markSelected() {
    if (!S.selected.size) {
        const info = document.getElementById('selectedInfo');
        info.style.color = 'var(--error)';
        setTimeout(updateSelected, 200);
        return;
    }
    const sel = document.getElementById('tagSelect');
    const tag = sel.value;
    if (!tag) return;
    
    for (let n of S.selected) {
        tag === 'clear' ? delete S.tags[n] : S.tags[n] = tag;
    }
    S.selected.clear();
    updateOutput();
    sel.value = '';
}

function saveProject() {
    if (!S.pages.length) { alert('No pages'); return; }
    if (S.idx >= 0) {
        S.pages[S.idx].text = document.getElementById('textArea').value;
        S.pages[S.idx].tags = {...S.tags};
        S.pages[S.idx].hasText = S.pages[S.idx].text.trim().length > 0;
    }
    
    let txt = '';
    for (let pg of S.pages) {
        if (pg.text.trim()) {
            txt += `${pg.name}:\n`;
            const lines = pg.text.split('\n');
            lines.forEach((line, i) => {
                const n = i + 1;
                const tag = pg.tags[n];
                txt += line.trim() ? (tag ? `${tag} ${line}\n` : `${line}\n`) : '\n';
            });
            txt += '\n';
        }
    }
    download('detected_text.txt', txt);
    
    const proj = { pages: S.pages.map(p => ({
        name: p.name, text: p.text, tags: p.tags, hasText: p.hasText
    }))};
    download('project.json', JSON.stringify(proj, null, 2));
    status('Project saved');
}

function showExportMenu() {
    document.getElementById('exportModal').style.display = 'flex';
}

function closeExportMenu() {
    document.getElementById('exportModal').style.display = 'none';
}

function exportAll() {
    if (!S.pages.length) return;
    if (S.idx >= 0) {
        S.pages[S.idx].text = document.getElementById('textArea').value;
        S.pages[S.idx].tags = {...S.tags};
    }
    let txt = '';
    S.pages.forEach((pg, i) => {
        txt += `PAGE ${i + 1}:\n${'-'.repeat(50)}\n`;
        const lines = pg.text.split('\n');
        lines.forEach((line, j) => {
            const tag = pg.tags[j + 1];
            txt += tag ? `${tag} ${line}\n` : `${line}\n`;
        });
        txt += '\n';
    });
    download('all_pages.txt', txt);
    closeExportMenu();
}

function exportTagged() {
    if (!S.pages.length) return;
    if (S.idx >= 0) {
        S.pages[S.idx].text = document.getElementById('textArea').value;
        S.pages[S.idx].tags = {...S.tags};
    }
    let txt = '', total = 0, tagged = 0;
    S.pages.forEach((pg, i) => {
        const lines = pg.text.split('\n').filter(l => l.trim());
        total += lines.length;
        const tlines = [];
        lines.forEach((line, j) => {
            const tag = pg.tags[j + 1];
            if (tag) {
                tlines.push(`${tag} ${line}`);
                tagged++;
            }
        });
        if (tlines.length) {
            txt += `PAGE ${i + 1}:\n${tlines.join('\n')}\n\n`;
        }
    });
    txt += `\n${'='.repeat(50)}\nSTATISTICS:\nTotal Lines: ${total}\nTagged Lines: ${tagged}\nCompletion: ${total ? ((tagged / total) * 100).toFixed(1) : 0}%\n`;
    download('tagged_script.txt', txt);
    closeExportMenu();
}

function exportCurrent() {
    if (S.idx < 0) return;
    const pg = S.pages[S.idx];
    pg.text = document.getElementById('textArea').value;
    pg.tags = {...S.tags};
    let txt = `PAGE ${S.idx + 1}:\n${'-'.repeat(50)}\n`;
    const lines = pg.text.split('\n');
    lines.forEach((line, i) => {
        const tag = pg.tags[i + 1];
        txt += tag ? `${tag} ${line}\n` : `${line}\n`;
    });
    download(`page_${S.idx + 1}.txt`, txt);
    closeExportMenu();
}

function exportStats() {
    if (!S.pages.length) return;
    if (S.idx >= 0) {
        S.pages[S.idx].text = document.getElementById('textArea').value;
        S.pages[S.idx].tags = {...S.tags};
    }
    let total = 0, tagged = 0;
    const counts = {};
    S.pages.forEach(pg => {
        const lines = pg.text.split('\n').filter(l => l.trim());
        total += lines.length;
        Object.values(pg.tags).forEach(tag => {
            tagged++;
            counts[tag] = (counts[tag] || 0) + 1;
        });
    });
    let txt = 'MANGA EDITOR PRO - STATISTICS\n' + '='.repeat(50) + '\n\n';
    txt += `Total Pages: ${S.pages.length}\nPages with Text: ${S.pages.filter(p => p.hasText).length}\n`;
    txt += `Total Lines: ${total}\nTagged Lines: ${tagged}\nUntagged Lines: ${total - tagged}\n`;
    txt += `Completion: ${total ? ((tagged / total) * 100).toFixed(1) : 0}%\n\nTAG BREAKDOWN:\n`;
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([tag, cnt]) => {
        txt += `${tag}: ${cnt} (${((cnt / tagged) * 100).toFixed(1)}%)\n`;
    });
    download('statistics.txt', txt);
    closeExportMenu();
}

function copyOutput() {
    const txt = document.getElementById('outputText').textContent;
    navigator.clipboard.writeText(txt);
    status('Output copied');
}

function download(name, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function status(msg) {
    document.getElementById('status').textContent = msg;
}

function updateStats() {
    const txt = document.getElementById('textArea').value;
    const lines = txt.split('\n').filter(l => l.trim());
    const tagged = Object.keys(S.tags).length;
    const pct = lines.length ? ((tagged / lines.length) * 100).toFixed(0) : 0;
    document.getElementById('stats').textContent = `Lines: ${lines.length} | Tagged: ${tagged} | ${pct}%`;
}
