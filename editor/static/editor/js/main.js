document.addEventListener("DOMContentLoaded", function () {

    // --- UI ELEMENTS ---
    const languageSelect = document.getElementById('language-select');
    const mainEditorContainer = document.getElementById('main-editor-container');
    const webEditorContainer = document.getElementById('web-editor-container');
    const outputArea = document.getElementById('output');
    const runButton = document.getElementById('run-button');
    const downloadButton = document.getElementById('download-button');
    const openFileButton = document.getElementById('open-file-button');
    const fileInput = document.getElementById('file-input');
    const themeToggle = document.getElementById('theme-toggle');
    const fontSizeSelect = document.getElementById('font-size-select');
    const filenameDisplay = document.getElementById('filename-display');
    const copyOutputButton = document.getElementById('copy-output-button');
    const copyCodeButton = document.getElementById('copy-code-button'); // NEW
    const clearOutputButton = document.getElementById('clear-output-button');
    const formatCodeButton = document.getElementById('format-code-button');
    const refreshPreviewButton = document.getElementById('refresh-preview-button');
    const toastContainer = document.getElementById('toast-container');
    const fullscreenPreviewButton = document.getElementById('fullscreen-preview-button');
    const webPreviewPane = document.getElementById('web-preview-pane');

    // --- GLOBAL STATE ---
    let socket;
    let currentInputBuffer = '';
    let autoSaveTimer;
    let isExecuting = false;

    // --- TOAST NOTIFICATION SYSTEM ---
    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = { success: 'check-circle', error: 'x-circle', info: 'info', warning: 'alert-triangle' }[type] || 'info';
        toast.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);
        lucide.createIcons();
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // --- EDITOR INITIALIZATION ---
    const createEditor = (id, mode) => CodeMirror.fromTextArea(document.getElementById(id), {
        lineNumbers: true, mode, theme: localStorage.getItem('editorTheme') || 'material-darker',
        indentUnit: 4, tabSize: 4, lineWrapping: false, autoCloseBrackets: true,
        matchBrackets: true, highlightSelectionMatches: true, styleActiveLine: true,
        foldGutter: true, gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        extraKeys: {
            "Ctrl-Enter": () => runButton.click(),
            "Ctrl-S": (cm) => { showToast('Code saved locally!', 'success'); return false; },
            "Ctrl-/": (cm) => toggleComment(cm),
            "Tab": (cm) => { if (cm.somethingSelected()) { cm.indentSelection("add"); } else { cm.replaceSelection("    ", "end"); } }
        }
    });

    const editor = createEditor('code-editor', 'python');
    const htmlEditor = createEditor('html-editor', 'htmlmixed');
    const cssEditor = createEditor('css-editor', 'css');
    const jsEditor = createEditor('js-editor', 'javascript');
    const allEditors = [editor, htmlEditor, cssEditor, jsEditor];

    htmlEditor.setValue(`<h1>Hello World!</h1>\n<p id="currentTime"></p>`);
    cssEditor.setValue(`body { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: Arial, sans-serif; background: linear-gradient(to bottom, #4a90e2, #50c9ff); }\n\nh1 { color: #2e5bb3; font-size: 3rem; margin: 0; }\n\np { color: #333; font-size: 1.2rem; margin-top: 1rem; }`);
    jsEditor.setValue(`function showTime() {\n  document.getElementById('currentTime').innerHTML = new Date().toUTCString();\n}\nshowTime();\nsetInterval(showTime, 1000);`);
    lucide.createIcons();
    
    // --- COMMENTED OUT AUTO-SAVE ---
    function loadCodeFromLocalStorage() {
        const lang = languageSelect.value;
        if (lang === 'web') {
            const savedHTML = localStorage.getItem('saved_html');
            const savedCSS = localStorage.getItem('saved_css');
            const savedJS = localStorage.getItem('saved_js');
            if (savedHTML) htmlEditor.setValue(savedHTML);
            if (savedCSS) cssEditor.setValue(savedCSS);
            if (savedJS) jsEditor.setValue(savedJS);
        } else {
            const savedCode = localStorage.getItem(`saved_${lang}`);
            if (savedCode) editor.setValue(savedCode);
        }
    }

    // --- COMMENT TOGGLE FUNCTION ---
    function toggleComment(cm) {
        const mode = cm.getMode().name;
        const commentSymbols = {
            'python': '#',
            'clike': '//',
            'javascript': '//',
            'css': ['/*', '*/'],
            'xml': ['<!--', '-->']
        };
        const symbol = commentSymbols[mode] || '//';
        const selections = cm.listSelections();
        selections.forEach(selection => {
            const from = selection.from();
            const to = selection.to();
            for (let i = from.line; i <= to.line; i++) {
                const line = cm.getLine(i);
                const trimmed = line.trim();
                if (Array.isArray(symbol)) {
                    if (trimmed.startsWith(symbol[0]) && trimmed.endsWith(symbol[1])) {
                        const newLine = line.replace(symbol[0], '').replace(symbol[1], '');
                        cm.replaceRange(newLine, { line: i, ch: 0 }, { line: i, ch: line.length });
                    } else {
                        cm.replaceRange(`${symbol[0]} ${line} ${symbol[1]}`, { line: i, ch: 0 }, { line: i, ch: line.length });
                    }
                } else {
                    if (trimmed.startsWith(symbol)) {
                        const newLine = line.replace(symbol, '').trim();
                        cm.replaceRange(newLine, { line: i, ch: 0 }, { line: i, ch: line.length });
                    } else {
                        cm.replaceRange(`${symbol} ${line}`, { line: i, ch: 0 }, { line: i, ch: line.length });
                    }
                }
            }
        });
    }

    // --- THEME TOGGLE ---
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        document.body.classList.toggle('dark-theme');
        const isLight = document.body.classList.contains('light-theme');
        const newTheme = isLight ? 'base16-light' : 'material-darker';
        allEditors.forEach(ed => ed.setOption('theme', newTheme));
        localStorage.setItem('editorTheme', newTheme);
        showToast(`Switched to ${isLight ? 'light' : 'dark'} theme`, 'info', 2000);
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            themeToggle.click();
        }
    });

    // --- FONT SIZE CONTROL ---
    fontSizeSelect.addEventListener('change', () => {
        const newSize = fontSizeSelect.value;
        document.querySelectorAll('.CodeMirror').forEach(el => {
            el.style.fontSize = newSize;
        });
        allEditors.forEach(ed => ed.refresh());
        localStorage.setItem('editorFontSize', newSize);
        showToast(`Font size: ${newSize}`, 'info', 2000);
    });

    // --- DOWNLOAD FUNCTIONALITY ---
    downloadButton.addEventListener('click', () => {
        const lang = languageSelect.value;
        if (lang === 'web') {
            const html = htmlEditor.getValue();
            const css = cssEditor.getValue();
            const js = jsEditor.getValue();
            const fullHTML = `<!DOCTYPE html>\n<html>\n<head>\n<style>\n${css}\n</style>\n</head>\n<body>\n${html}\n<script>\n${js}\n</script>\n</body>\n</html>`;
            downloadFile('index.html', fullHTML);
            showToast('HTML file downloaded!', 'success');
        } else {
            const code = editor.getValue();
            const fileExtensions = { python: 'py', c: 'c', cpp: 'cpp', java: 'java' };
            const filename = filenameDisplay.textContent || `code.${fileExtensions[lang] || 'txt'}`;
            downloadFile(filename, code);
            showToast(`${filename} downloaded!`, 'success');
        }
    });

    function downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
    
    // --- OPEN FILE ---
    if (openFileButton && fileInput) {
        openFileButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) { return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                editor.setValue(e.target.result);
                filenameDisplay.textContent = file.name;
                showToast(`${file.name} loaded successfully!`, 'success');
            };
            reader.readAsText(file);
            event.target.value = '';
        });
    }

    // --- NEW: COPY CODE BUTTON ---
    if (copyCodeButton) {
        copyCodeButton.addEventListener('click', () => {
            const text = editor.getValue();
            if (text.trim()) {
                navigator.clipboard.writeText(text).then(() => {
                    showToast('Code copied to clipboard!', 'success');
                }).catch(() => {
                    showToast('Failed to copy code', 'error');
                });
            } else {
                showToast('No code to copy', 'warning');
            }
        });
    }

    // --- COPY OUTPUT ---
    copyOutputButton.addEventListener('click', () => {
        const text = outputArea.textContent;
        if (text.trim()) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Output copied to clipboard!', 'success');
            }).catch(() => {
                showToast('Failed to copy output', 'error');
            });
        } else {
            showToast('No output to copy', 'warning');
        }
    });
    
    // --- CLEAR OUTPUT ---
    clearOutputButton.addEventListener('click', () => { outputArea.textContent = ''; showToast('Output cleared', 'info', 2000); });
    
    // --- FORMAT CODE ---
    if (formatCodeButton) {
        formatCodeButton.addEventListener('click', () => {
            const currentEditor = languageSelect.value === 'web' ? htmlEditor : editor;
            currentEditor.execCommand('selectAll');
            currentEditor.execCommand('indentAuto');
            currentEditor.setCursor(currentEditor.lineCount(), 0);
            showToast('Code formatted!', 'success', 2000);
        });
    }

    // --- REFRESH PREVIEW ---
    if (refreshPreviewButton) { 
        refreshPreviewButton.addEventListener('click', () => { 
            updatePreview(); 
            showToast('Preview refreshed', 'info', 2000); 
        }); 
    }

    // --- LOAD USER PREFERENCES ---
    (function loadPreferences() {
        const savedTheme = localStorage.getItem('editorTheme') || 'material-darker';
        const savedFontSize = localStorage.getItem('editorFontSize') || '14px';
        if (savedTheme === 'base16-light') {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        }
        allEditors.forEach(ed => ed.setOption('theme', savedTheme));
        document.querySelectorAll('.CodeMirror').forEach(el => {
            el.style.fontSize = savedFontSize;
        });
        fontSizeSelect.value = savedFontSize;
        loadCodeFromLocalStorage();
    })();
    
    // --- LIVE PREVIEW ---
    const updatePreview = () => {
        const iframe = document.getElementById('preview-iframe');
        const iframeDoc = iframe.contentWindow.document;
        const content = `
<!DOCTYPE html>
<html>
<head><style>${cssEditor.getValue()}</style></head>
<body>${htmlEditor.getValue()}<script>${jsEditor.getValue()}<\/script></body>
</html>`;
        iframeDoc.open();
        iframeDoc.write(content);
        iframeDoc.close();
    };

    let previewTimer;
    [htmlEditor, cssEditor, jsEditor].forEach(ed => { ed.on('change', () => { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 500); }); });

    // --- INTERACTIVE TERMINAL ---
    outputArea.setAttribute('tabindex', '0');
    outputArea.addEventListener('keydown', (event) => {
        if (socket && socket.readyState === WebSocket.OPEN && outputArea.classList.contains('waiting-for-input')) {
            event.preventDefault();
            const key = event.key;
            if (key === 'Enter') {
                outputArea.textContent += '\n';
                socket.send(JSON.stringify({ action: 'input', data: currentInputBuffer + '\n' }));
                currentInputBuffer = '';
                outputArea.classList.remove('waiting-for-input');
            } else if (key === 'Backspace') {
                if (currentInputBuffer.length > 0) {
                    currentInputBuffer = currentInputBuffer.slice(0, -1);
                    outputArea.textContent = outputArea.textContent.slice(0, -1);
                }
            } else if (key.length === 1) {
                currentInputBuffer += key;
                outputArea.textContent += key;
            }
        }
    });

    // --- LANGUAGE SWITCHING (FIXED) ---
    languageSelect.addEventListener('change', function () {
        const lang = this.value;
        if (lang === 'web') {
            mainEditorContainer.classList.add('hidden');
            webEditorContainer.classList.remove('hidden');
            [htmlEditor, cssEditor, jsEditor].forEach(ed => ed.refresh());
            updatePreview();
        } else {
            mainEditorContainer.classList.remove('hidden');
            webEditorContainer.classList.add('hidden');
            let mode = 'python', filename = 'script.py';
            if (lang === 'c') { mode = 'text/x-csrc'; filename = 'main.c'; }
            else if (lang === 'cpp') { mode = 'text/x-c++src'; filename = 'main.cpp'; }
            else if (lang === 'java') { mode = 'text/x-java'; filename = 'Main.java'; }
            editor.setOption("mode", mode);
            const defaultSnippet = window.DEMO_SNIPPETS?.[lang] || `# ${lang} code here...`;
            editor.setValue(defaultSnippet);
            filenameDisplay.textContent = filename;
            editor.refresh();
        }
    });
    languageSelect.dispatchEvent(new Event('change'));

    // --- HELPER FUNCTION TO FIX ICON BUG ---
    function updateRunIcon(iconName) {
        const currentIcon = runButton.querySelector('.run-icon');
        if (currentIcon) {
            const newIcon = document.createElement('i');
            newIcon.setAttribute('data-lucide', iconName);
            newIcon.className = 'run-icon';
            currentIcon.replaceWith(newIcon);
            lucide.createIcons();
        }
    }

    // --- RUN/STOP BUTTON CLICK HANDLER ---
    runButton.addEventListener('click', () => {
        if (isExecuting && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'stop' }));
            showToast('Execution terminated.', 'warning');
            return;
        }
        const lang = languageSelect.value;
        if (lang === 'web') {
            updatePreview();
            showToast('Preview updated!', 'success');
            return;
        }
        const code = editor.getValue();
        if (!code.trim()) {
            showToast('Please write some code first', 'warning');
            return;
        }
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            socket.close();
        }
        runWithWebSocket(lang, code);
    });

    // --- runWithWebSocket FUNCTION ---
    function runWithWebSocket(language, code) {
        outputArea.textContent = "🚀 Connecting to execution server...\n";
        isExecuting = true;
        runButton.disabled = false;
        runButton.classList.add('stop-mode');
        runButton.querySelector('span').textContent = 'Stop';
        updateRunIcon('square');
        
        socket = new WebSocket(`ws://${window.location.host}/ws/execute/`);
        
        socket.onopen = () => {
            socket.send(JSON.stringify({ action: 'run', language, code }));
            outputArea.textContent = "⚡ Executing code...\n\n";
        };
        
        socket.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.output) {
                outputArea.textContent += data.output;
                outputArea.scrollTop = outputArea.scrollHeight;
                if (!data.output.endsWith('\n') && !data.output.endsWith('\r\n')) {
                    outputArea.classList.add('waiting-for-input');
                    outputArea.focus();
                }
            }
            if (data.event === 'finished') {
                if (!outputArea.textContent.includes("Process finished successfully")) {
                    outputArea.textContent += "\n\n✅ Process finished successfully";
                }
                showToast('Execution completed!', 'success');
                socket.close();
            }
        };
        
        socket.onclose = () => {
            isExecuting = false;
            runButton.disabled = false;
            runButton.classList.remove('stop-mode');
            runButton.querySelector('span').textContent = 'Run';
            updateRunIcon('play');
            outputArea.classList.remove('waiting-for-input');
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            outputArea.textContent += `\n\n❌ WebSocket connection error.`;
            showToast('Connection error!', 'error');
        };
    }

    window.addEventListener('resize', () => { 
    editor.refresh();
    htmlEditor.refresh();
    cssEditor.refresh();
    jsEditor.refresh();
});


    // --- FULLSCREEN PREVIEW LOGIC ---
    if (fullscreenPreviewButton && webPreviewPane) {
        fullscreenPreviewButton.addEventListener('click', () => {
            webPreviewPane.classList.toggle('fullscreen');
            const isFullscreen = webPreviewPane.classList.contains('fullscreen');
            const icon = fullscreenPreviewButton.querySelector('.fullscreen-icon');
            icon.setAttribute('data-lucide', isFullscreen ? 'minimize' : 'maximize');
            lucide.createIcons();
        });
    }
});
