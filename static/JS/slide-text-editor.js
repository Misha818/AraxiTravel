/*
 * Formatted title/subtitle field for the Add/Edit Slide forms (templates/add_slide.html,
 * templates/edit_slide.html): one line of text with bold, italic, underline and colour, applied
 * to the selected text or, when nothing is selected, to the whole field. Undo/redo (buttons and
 * Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) covers typing and all formatting, colours included.
 *
 * Built on Quill 1.3.6 (static/JS/1-3-6-quill.js); the colour picker is Pickr, created in the
 * templates and connected through holdTarget() / applyColor(). The formatting is saved as "runs"
 * ([{"t": "Discover ", "b": 1, "c": "#3498db"}, ...], checked by sanitize_text_format() in
 * sysadmin.py) and shown on the landing page by static/JS/landing.js.
 *
 * Colour storage: when the whole text has one colour it is saved as the field's colour
 * (Title_Color / Subtitle_Color, as before); otherwise each run keeps its own colour.
 */
(function () {
    'use strict';

    const colorProbe = document.createElement('canvas').getContext('2d');

    // Any CSS colour ("red", "#3498DBFF", "rgb(...)") -> "#rrggbb", or "#rrggbbaa" when it is
    // transparent (short enough for the VARCHAR(20) Title_Color column); '' if invalid.
    function normalizeColor(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        // an invalid colour leaves the previous fillStyle in place, so test against two sentinels
        for (const sentinel of ['#010203', '#040506']) {
            colorProbe.fillStyle = sentinel;
            colorProbe.fillStyle = value.trim();
            if (colorProbe.fillStyle === sentinel) continue;
            const result = colorProbe.fillStyle;            // "#rrggbb" or "rgba(r, g, b, a)"
            if (result.charAt(0) === '#') return result;
            const parts = result.match(/[\d.]+/g);
            if (!parts || parts.length < 4) return '';
            const hex = function (n) { return Math.round(Number(n)).toString(16).padStart(2, '0'); };
            return '#' + hex(parts[0]) + hex(parts[1]) + hex(parts[2]) + hex(Number(parts[3]) * 255);
        }
        return '';
    }

    // Relative luminance 0..1 of a normalized colour (mostly transparent colours count as mid-tone).
    function luminance(color) {
        const hex = (color || '').slice(1);
        if (hex.length < 6) return 0.5;
        if (hex.length === 8 && parseInt(hex.slice(6, 8), 16) < 102) return 0.5;
        const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    // Saved runs -> list of runs, or null when they are missing, invalid or do not spell `text`.
    function parseRuns(format, text) {
        if (!format) return null;
        let runs;
        try { runs = typeof format === 'string' ? JSON.parse(format) : format; } catch (e) { return null; }
        if (!Array.isArray(runs)) return null;
        const clean = [];
        for (const run of runs) {
            if (!run || typeof run.t !== 'string') return null;
            clean.push({ t: run.t, b: !!run.b, i: !!run.i, u: !!run.u, c: normalizeColor(run.c || '') });
        }
        return clean.map(function (run) { return run.t; }).join('') === text ? clean : null;
    }

    class SlideTextEditor {
        /*
         * field: the [data-rt-field] wrapper holding the toolbar and the [data-rt-editor] element.
         * options: { maxLength, placeholder }
         */
        constructor(field, options) {
            options = options || {};
            this.field = field;
            this.toolbar = field.querySelector('[data-rt-toolbar]');
            this.editorEl = field.querySelector('[data-rt-editor]');
            this.targetLabel = field.querySelector('[data-rt-target]');
            this.maxLength = options.maxLength || 255;
            this.range = null;        // last selection inside the editor (kept while using the toolbar)
            this.heldTarget = null;   // target frozen while the colour picker is open

            this.quill = new Quill(this.editorEl, {
                formats: ['bold', 'italic', 'underline', 'color'],   // pasted text keeps only these
                placeholder: options.placeholder || '',
                modules: {
                    toolbar: false,
                    // every toolbar action is its own undo step; typing is grouped per 0.5 s pause
                    history: { delay: 500, maxStack: 200, userOnly: true },
                    keyboard: {
                        bindings: {   // single line: no line breaks
                            enter: { key: 13, handler: function () { return false; } },
                            shiftEnter: { key: 13, shiftKey: true, handler: function () { return false; } }
                        }
                    }
                }
            });
            const root = this.quill.root;
            root.setAttribute('role', 'textbox');
            root.setAttribute('aria-multiline', 'false');
            if (this.editorEl.getAttribute('aria-labelledby')) root.setAttribute('aria-labelledby', this.editorEl.getAttribute('aria-labelledby'));
            // Quill binds Ctrl+Y only on Windows: make redo work the same everywhere
            this.quill.keyboard.addBinding({ key: 'Y', shortKey: true }, () => { this.redo(); return false; });

            this.bind();
            this.update();
        }

        bind() {
            this.quill.on('selection-change', (range) => {
                if (range) {
                    this.range = range;
                } else {
                    // Focus left the editor: keep the selection only if it went to this toolbar
                    // (e.g. the colour picker), otherwise the buttons go back to the whole text.
                    setTimeout(() => {
                        if (!this.toolbar.contains(document.activeElement) && !this.heldTarget) this.range = null;
                        this.update();
                    }, 0);
                }
                this.update();
            });
            this.quill.on('text-change', (delta, oldDelta, source) => {
                if (source === 'user') this.normalize();
                this.update();
            });

            this.toolbar.querySelectorAll('button[data-rt]').forEach((button) => {
                // keep the text selection when a button is pressed
                button.addEventListener('mousedown', function (e) { e.preventDefault(); });
                button.addEventListener('click', () => {
                    const action = button.dataset.rt;
                    if (action === 'bold' || action === 'italic' || action === 'underline') this.toggle(action);
                    if (action === 'clear-color') this.applyColor(false);
                    if (action === 'clear') this.clearFormatting();
                    if (action === 'undo') this.undo();
                    if (action === 'redo') this.redo();
                });
            });
        }

        // Selected text, or the whole text when nothing is selected.
        target() {
            if (this.heldTarget) return this.heldTarget;
            const length = this.quill.getLength() - 1;      // without Quill's final line break
            const range = this.range;
            if (range && range.length > 0) {
                const index = Math.min(range.index, length);
                return { index: index, length: Math.min(range.length, length - index), whole: false };
            }
            return { index: 0, length: length, whole: true };
        }

        // Called when the colour picker opens/closes: the colour goes to what was targeted when it opened.
        holdTarget(hold) {
            this.heldTarget = hold ? this.target() : null;
            if (!hold) this.update();
            return this.heldTarget;
        }

        // Colour of the target if it has a single one, else ''.
        targetColor() {
            const target = this.target();
            if (target.length === 0) return '';
            const color = this.quill.getFormat(target.index, target.length).color;
            return typeof color === 'string' ? color : '';
        }

        apply(name, value) {
            const target = this.target();
            this.quill.history.cutoff();
            if (target.length === 0) {
                // empty field: the format applies to what is typed next
                this.quill.focus();
                this.quill.format(name, value, 'user');
            } else {
                this.quill.formatText(target.index, target.length, name, value, 'user');
                if (!target.whole && !this.heldTarget) this.quill.setSelection(target.index, target.length, 'user');
            }
            this.quill.history.cutoff();
            this.update();
        }

        applyColor(color) {
            const value = color ? normalizeColor(color) : '';
            this.apply('color', value || false);
        }

        // Only the chosen style changes; colour and the other styles are kept.
        toggle(name) {
            const target = this.target();
            const formats = target.length > 0 ? this.quill.getFormat(target.index, target.length) : this.currentFormats();
            this.apply(name, formats[name] !== true);
        }

        clearFormatting() {
            const target = this.target();
            if (target.length === 0) return;
            this.quill.history.cutoff();
            this.quill.removeFormat(target.index, target.length, 'user');
            this.quill.history.cutoff();
            if (!target.whole) this.quill.setSelection(target.index, target.length, 'user');
            this.update();
        }

        undo() { this.quill.history.undo(); this.update(); }
        redo() { this.quill.history.redo(); this.update(); }

        currentFormats() {
            return this.range ? this.quill.getFormat(this.range.index, 0) : {};
        }

        // Pasted line breaks become spaces; the text is cut at maxLength (database column size).
        // Done as user changes so they are part of the undo history.
        normalize() {
            const body = this.quill.getText().slice(0, -1);
            for (let i = body.length - 1; i >= 0; i--) {
                if (body[i] === '\n' || body[i] === '\r') {
                    const formats = this.quill.getFormat(i, 1);
                    this.quill.deleteText(i, 1, 'user');
                    this.quill.insertText(i, ' ', formats, 'user');
                }
            }
            const length = this.quill.getLength() - 1;
            if (length > this.maxLength) this.quill.deleteText(this.maxLength, length - this.maxLength, 'user');
        }

        update() {
            const target = this.target();
            const formats = target.length > 0 ? this.quill.getFormat(target.index, target.length) : this.currentFormats();
            this.toolbar.querySelectorAll('button[data-rt="bold"], button[data-rt="italic"], button[data-rt="underline"]').forEach(function (button) {
                const active = formats[button.dataset.rt] === true;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            const stack = this.quill.history.stack;
            const undoBtn = this.toolbar.querySelector('button[data-rt="undo"]');
            const redoBtn = this.toolbar.querySelector('button[data-rt="redo"]');
            if (undoBtn) undoBtn.disabled = stack.undo.length === 0;
            if (redoBtn) redoBtn.disabled = stack.redo.length === 0;
            if (this.targetLabel) {
                if (target.whole) {
                    this.targetLabel.textContent = this.targetLabel.dataset.whole;
                    this.field.classList.remove('has-selection');
                } else {
                    let text = this.quill.getText(target.index, target.length);
                    if (text.length > 40) text = text.slice(0, 39) + '…';
                    this.targetLabel.textContent = this.targetLabel.dataset.selection + ' “' + text + '”';
                    this.field.classList.add('has-selection');
                }
            }
            this.updateContrast();
        }

        // Slides often use white text, which would be invisible on the white field: when there is
        // light text and no more dark text than light, show the field dark (like the slide; text
        // without a colour is then white, as on the landing page). Mid-tones read on both.
        updateContrast() {
            let light = 0, dark = 0;
            this.quill.getContents().ops.forEach(function (op) {
                if (typeof op.insert !== 'string' || !op.attributes || !op.attributes.color) return;
                const length = op.insert.replace(/\n/g, '').length;
                const lum = luminance(normalizeColor(op.attributes.color));
                if (lum > 0.72) light += length;
                if (lum < 0.35) dark += length;
            });
            this.editorEl.classList.toggle('rt-editor--dark', light > 0 && light >= dark);
        }

        // Plain text (saved in Title / Subtitle).
        getText() {
            return this.quill.getText().slice(0, -1);
        }

        // Runs of the current content (colours normalized).
        runs() {
            const runs = [];
            this.quill.getContents().ops.forEach(function (op) {
                if (typeof op.insert !== 'string') return;
                const text = op.insert.replace(/\n/g, '');
                if (!text) return;
                const attributes = op.attributes || {};
                const run = { t: text };
                if (attributes.bold) run.b = 1;
                if (attributes.italic) run.i = 1;
                if (attributes.underline) run.u = 1;
                const color = normalizeColor(attributes.color);
                if (color) run.c = color;
                runs.push(run);
            });
            return runs;
        }

        // The single colour of the whole text (saved in Title_Color / Subtitle_Color), or ''.
        getColor() {
            const runs = this.runs();
            if (!runs.length || !runs[0].c) return '';
            const color = runs[0].c;
            return runs.every(function (run) { return run.c === color; }) ? color : '';
        }

        // Runs as JSON (saved in Title_Format / Subtitle_Format), or '' when nothing is formatted.
        // A colour shared by the whole text is left to getColor().
        getFormatJSON() {
            const shared = this.getColor();
            const runs = this.runs().map(function (run) {
                if (shared) delete run.c;
                return run;
            });
            return runs.some(function (run) { return Object.keys(run).length > 1; }) ? JSON.stringify(runs) : '';
        }

        // Loads saved text, formatting and field colour (formatting is ignored if it does not match the text).
        setContent(text, format, color) {
            text = text || '';
            const base = normalizeColor(color || '');
            const runs = parseRuns(format, text);
            const ops = (runs || (text ? [{ t: text }] : [])).map(function (run) {
                const attributes = {};
                if (run.b) attributes.bold = true;
                if (run.i) attributes.italic = true;
                if (run.u) attributes.underline = true;
                if (run.c || base) attributes.color = run.c || base;
                return Object.keys(attributes).length ? { insert: run.t, attributes: attributes } : { insert: run.t };
            });
            ops.push({ insert: '\n' });
            this.quill.setContents(ops, 'silent');
            this.quill.history.clear();
            this.update();
        }
    }

    // Araxi Travel colours for the colour pickers (static/JS/araxi-palette.js, loaded before this file)
    SlideTextEditor.PALETTE = window.ARAXI_PALETTE || [];

    window.SlideTextEditor = SlideTextEditor;
})();
