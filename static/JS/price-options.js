// Add Price / Edit Price (templates/_price_options.html):
//   PriceOptions  - how the price is set (fixed / by vehicle / by age group), the option tabs with
//                   their prices, guide prices and the additional-notes settings
//   SpecFields    - the product type specification fields, each shown as its category requires
//                   (spss_category: 1 Text, 2 Num, 3 Bool, 4 Date, 5 DateTime, 6 Location)
// Texts come from <script type="application/json" id="priceOptionsText">.
(function () {
    'use strict';

    function texts() {
        const el = document.getElementById('priceOptionsText');
        return el ? JSON.parse(el.textContent) : {};
    }

    function formatPrice(value, t) {
        if (value === '') {
            return t.notOffered;
        }
        const number = Number(value);
        if (number === 0) {
            return t.free;
        }
        return t.currency + ' ' + number.toLocaleString('en-US');
    }

    // ---------- Tabs: one tab per option, its price field in the tab's panel ----------
    function selectTab(tab, focus) {
        const tablist = tab.closest('[role="tablist"]');
        const tabs = tablist.parentElement;
        tablist.querySelectorAll('[role="tab"]').forEach(other => {
            const selected = other === tab;
            other.setAttribute('aria-selected', selected ? 'true' : 'false');
            other.tabIndex = selected ? 0 : -1;
            const panel = tabs.querySelector('#' + CSS.escape(other.getAttribute('aria-controls')));
            if (panel) {
                panel.hidden = !selected;
            }
        });
        if (focus) {
            tab.focus();
        }
    }

    function initTabs(root, t) {
        root.querySelectorAll('[data-tabs]').forEach(tabs => {
            const tablist = tabs.querySelector('[role="tablist"]');
            tablist.addEventListener('click', event => {
                const tab = event.target.closest('[role="tab"]');
                if (tab) {
                    selectTab(tab, false);
                    // the price field of the chosen option is ready for typing
                    const input = tabs.querySelector('#' + CSS.escape(tab.getAttribute('aria-controls')) + ' input');
                    if (input) {
                        input.focus();
                    }
                }
            });
            // arrow keys, Home and End move between the tabs
            tablist.addEventListener('keydown', event => {
                const all = [...tablist.querySelectorAll('[role="tab"]')];
                const index = all.indexOf(document.activeElement);
                if (index === -1) {
                    return;
                }
                let next = null;
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = all[(index + 1) % all.length];
                if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = all[(index - 1 + all.length) % all.length];
                if (event.key === 'Home') next = all[0];
                if (event.key === 'End') next = all[all.length - 1];
                if (next) {
                    event.preventDefault();
                    selectTab(next, true);
                }
            });
            // the tab shows its price as it is typed
            tabs.addEventListener('input', event => {
                const panel = event.target.closest('[role="tabpanel"]');
                if (!panel) {
                    return;
                }
                event.target.classList.remove('invalid');
                const tab = tablist.querySelector('#' + CSS.escape(panel.getAttribute('aria-labelledby')));
                const badge = tab && tab.querySelector('[data-tab-price]');
                if (badge) {
                    const value = event.target.value.trim();
                    badge.textContent = formatPrice(value, t);
                    badge.classList.toggle('is-empty', value === '');
                }
                if (tab) {
                    tab.classList.remove('invalid');
                }
            });
        });
    }

    function selectedBasis(root) {
        const checked = root.querySelector('input[name="pricingBasis"]:checked');
        return checked ? checked.value : '0';
    }

    function showBasis(root) {
        const basis = selectedBasis(root);
        root.querySelectorAll('[data-basis-panel]').forEach(panel => {
            panel.hidden = panel.dataset.basisPanel !== basis;
        });
        // parts shown with some ways ("Who can join": fixed and vehicle pricing)
        root.querySelectorAll('[data-basis-show]').forEach(part => {
            part.hidden = !part.dataset.basisShow.split(' ').includes(basis);
        });
    }

    // Marks an option price field wrong and shows it (selects its tab)
    function markInvalid(input) {
        input.classList.add('invalid');
        const panel = input.closest('[role="tabpanel"]');
        if (panel) {
            const tab = document.getElementById(panel.getAttribute('aria-labelledby'));
            if (tab) {
                tab.classList.add('invalid');
                selectTab(tab, false);
            }
        }
    }

    // Adds the option prices with this name prefix to formData: error message or null
    function collectOptionPrices(scope, prefix, formData, t, required) {
        let count = 0;
        let error = null;
        scope.querySelectorAll('input[name^="' + prefix + '"]').forEach(input => {
            const value = input.value.trim();
            input.classList.remove('invalid');
            if (value === '') {
                return;
            }
            if (!/^\d+$/.test(value)) {
                markInvalid(input);
                error = error || t.wholeNumbers;
                return;
            }
            formData.append(input.name, value);
            count++;
        });
        if (!error && required && count === 0) {
            const first = scope.querySelector('input[name^="' + prefix + '"]');
            if (first) {
                markInvalid(first);
            }
            error = required;
        }
        return error;
    }

    const PriceOptions = {
        init: function () {
            const root = document.getElementById('priceOptions');
            if (!root) {
                return;
            }
            const t = texts();
            initTabs(document, t);
            root.querySelectorAll('input[name="pricingBasis"]').forEach(radio => {
                radio.addEventListener('change', () => showBasis(root));
            });
            showBasis(root);

            const notesEnabled = document.getElementById('notesEnabled');
            const notesRequiredRow = document.getElementById('notesRequiredRow');
            if (notesEnabled && notesRequiredRow) {
                notesEnabled.addEventListener('change', () => {
                    notesRequiredRow.hidden = !notesEnabled.checked;
                });
            }

            // "No guide": offered (free) or not (a guide is required); its tab shows which
            const noGuideOffered = document.getElementById('noGuideOffered');
            const noGuidePrice = document.getElementById('noGuidePrice');
            if (noGuideOffered && noGuidePrice) {
                noGuideOffered.addEventListener('change', () => {
                    noGuidePrice.textContent = noGuideOffered.checked ? t.free : t.notOffered;
                    noGuidePrice.classList.toggle('is-empty', !noGuideOffered.checked);
                });
            }
        },

        // Adds the pricing basis, its prices, who can join, the adult rule, the guide prices and settings and
        // the notes settings to formData.
        // Returns an error message (and marks the wrong field) or null
        collect: function (formData) {
            const root = document.getElementById('priceOptions');
            const t = texts();
            const basis = selectedBasis(root);
            formData.append('pricingBasis', basis);

            // how long it takes (required): days, hours 0-23, minutes 0-59, more than 0 in all
            let error = null;
            const durationField = document.getElementById('durationField');
            if (durationField) {
                const parts = [...durationField.querySelectorAll('input[type="number"]')];
                let total = 0;
                parts.forEach(input => {
                    const text = input.value.trim();
                    const value = text === '' ? 0 : Number(text);
                    const bad = !Number.isInteger(value) || value < 0 || value > Number(input.max);
                    input.classList.toggle('invalid', bad);
                    if (bad && !error) {
                        error = t.durationParts;
                    }
                    total += bad ? 0 : value;
                    formData.append(input.name, text);
                });
                if (!error && total === 0) {
                    parts.forEach(input => input.classList.add('invalid'));
                    error = t.duration;
                }
            }

            if (basis === '0') {
                const priceInput = document.getElementById('price');
                priceInput.classList.remove('invalid');
                if (priceInput.value.trim() === '' || Number(priceInput.value) < 0) {
                    priceInput.classList.add('invalid');
                    error = error || t.specifyPrice;
                } else {
                    formData.append('price', priceInput.value.trim());
                }
            } else if (basis === '1') {
                error = collectOptionPrices(root.querySelector('[data-basis-panel="1"]'), 'vprice_', formData, t, t.oneVehicle) || error;
            } else {
                error = collectOptionPrices(root.querySelector('[data-basis-panel="2"]'), 'ageprice_', formData, t, t.oneAge) || error;
            }

            // without "No guide" at least one guide language must have a price
            const noGuideOffered = document.getElementById('noGuideOffered');
            const guideRequired = Boolean(noGuideOffered) && !noGuideOffered.checked;
            formData.append('guideRequired', guideRequired ? '1' : '0');
            error = collectOptionPrices(document, 'guideprice_', formData, t, guideRequired ? t.oneGuide : null) || error;

            // who can join: the checked age groups (fixed / vehicle pricing) or the priced ones (age group pricing)
            const ageChecks = [...root.querySelectorAll('input[name="allowedAge"]')];
            const ageBox = root.querySelector('.po-ages');
            if (ageBox) {
                ageBox.classList.remove('invalid');
            }
            let allowed;
            if (basis === '2') {
                allowed = [...root.querySelectorAll('[data-basis-panel="2"] input[name^="ageprice_"]')]
                    .filter(input => input.value.trim() !== '').map(input => input.name.slice('ageprice_'.length));
            } else {
                allowed = ageChecks.filter(box => box.checked).map(box => box.value);
                formData.append('allowedAges', allowed.join(','));
                if (!error && allowed.length === 0) {
                    ageBox.classList.add('invalid');
                    error = t.oneAgeAllowed;
                }
            }
            const adultRequired = document.getElementById('adultRequired');
            if (adultRequired) {
                formData.append('adultRequired', adultRequired.checked ? '1' : '0');
                const adultIDs = ageChecks.filter(box => 'adult' in box.dataset).map(box => box.value);
                if (!error && adultRequired.checked && !allowed.some(id => adultIDs.includes(id))) {
                    error = t.adultCanJoin;
                }
            }

            const notesEnabled = document.getElementById('notesEnabled');
            const notesRequired = document.getElementById('notesRequired');
            if (notesEnabled) {
                formData.append('notesEnabled', notesEnabled.checked ? '1' : '0');
                formData.append('notesRequired', notesEnabled.checked && notesRequired && notesRequired.checked ? '1' : '0');
            }
            return error;
        }
    };

    // ---------- Specification fields by category ----------
    const CATEGORY = { TEXT: 1, NUM: 2, BOOL: 3, DATE: 4, DATETIME: 5, LOCATION: 6 };
    const GOOGLE_HOSTS = ['www.google.com', 'google.com', 'maps.google.com'];

    // A Location value from what was pasted: an address (kept as it is) or a Google Maps link that
    // can be shown in a frame. Returns {value} or {error}
    function normalizeLocation(raw, t) {
        const value = raw.trim();
        if (value === '') {
            return { value: '' };
        }

        let link = value;
        if (/<iframe/i.test(value)) {
            const src = value.match(/src\s*=\s*["']([^"']+)["']/i);
            if (!src) {
                return { error: t.locationBad };
            }
            link = src[1].replace(/&amp;/g, '&');
        }

        if (!/^https?:\/\//i.test(link)) {
            return /[<>]/.test(link) ? { error: t.locationBad } : { value: value };
        }

        let url;
        try {
            url = new URL(link);
        } catch (e) {
            return { error: t.locationBad };
        }
        if (url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl') {
            return { error: t.locationShort };
        }
        if (!GOOGLE_HOSTS.includes(url.hostname) || !url.pathname.startsWith('/maps')) {
            return { error: t.locationBad };
        }
        if (url.pathname.startsWith('/maps/embed')) {
            return { value: 'https://www.google.com' + url.pathname + url.search };
        }

        // a link to a place, a search or coordinates: shown with Google's embeddable map of it
        let query = url.searchParams.get('q') || url.searchParams.get('query');
        if (!query) {
            const place = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
            const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
            if (place) {
                query = decodeURIComponent(place[1].replace(/\+/g, ' '));
            } else if (at) {
                query = at[1] + ',' + at[2];
            }
        }
        if (!query) {
            return { error: t.locationBad };
        }
        return { value: 'https://www.google.com/maps?q=' + encodeURIComponent(query) + '&output=embed' };
    }

    // The map shown for a Location value
    function mapSrc(value) {
        if (/^https:\/\//i.test(value)) {
            return value;
        }
        return 'https://www.google.com/maps?q=' + encodeURIComponent(value) + '&output=embed';
    }

    function showMap(field, value, t) {
        let frame = field.querySelector('iframe');
        if (!value) {
            if (frame) {
                frame.remove();
            }
            return;
        }
        const src = mapSrc(value);
        if (!frame) {
            frame = document.createElement('iframe');
            frame.className = 'spec-map';
            frame.loading = 'lazy';
            frame.referrerPolicy = 'no-referrer-when-downgrade';
            frame.title = t.mapTitle;
            field.appendChild(frame);
        }
        if (frame.src !== src) {
            frame.src = src;
        }
    }

    function setFieldError(field, message) {
        const control = field.querySelector('.spec-value');
        let note = field.querySelector('.spec-error');
        control.classList.toggle('invalid', Boolean(message));
        if (!message) {
            if (note) {
                note.remove();
            }
            return;
        }
        if (!note) {
            note = document.createElement('p');
            note.className = 'spec-error';
            note.setAttribute('role', 'alert');
            control.insertAdjacentElement('afterend', note);
        }
        note.textContent = message;
    }

    // One field: <label> + its control (.spec-value, data-spss-id), inside .spec-field
    function buildField(row, t) {
        const id = String(row.ID);
        const category = Number(row.spssCategoryID) || CATEGORY.TEXT;
        const value = row.Value === null || row.Value === undefined ? '' : String(row.Value).trim();

        const field = document.createElement('div');
        field.className = 'spec-field';
        field.dataset.category = category;

        const label = document.createElement('label');
        label.setAttribute('for', id);
        label.textContent = row.Text;
        field.appendChild(label);

        let control;
        if (category === CATEGORY.BOOL) {
            control = document.createElement('select');
            [['', t.choose], ['1', t.yes], ['0', t.no]].forEach(([optionValue, text]) => {
                const option = document.createElement('option');
                option.value = optionValue;
                option.textContent = text;
                control.appendChild(option);
            });
            control.value = ['0', '1'].includes(value) ? value : '';
        } else {
            control = document.createElement('input');
            control.type = category === CATEGORY.NUM ? 'number' : 'text';
            if (category === CATEGORY.NUM) {
                control.step = 'any';
                control.inputMode = 'decimal';
            }
            if (category === CATEGORY.LOCATION) {
                control.placeholder = t.locationPlaceholder;
                control.maxLength = 2000;
            } else {
                control.maxLength = 255;
            }
            control.value = value;
            control.autocomplete = 'off';
        }
        control.id = id;
        control.name = id;
        control.className = 'spec-value';
        control.dataset.spssId = id;
        field.appendChild(control);

        if (category === CATEGORY.DATE || category === CATEGORY.DATETIME) {
            control.classList.add('spec-date');
            if (typeof window.flatpickr === 'function') {
                window.flatpickr(control, {
                    dateFormat: category === CATEGORY.DATE ? 'Y-m-d' : 'Y-m-d H:i',
                    enableTime: category === CATEGORY.DATETIME,
                    time_24hr: true,
                    allowInput: true,
                    disableMobile: true
                });
            } else {
                control.placeholder = category === CATEGORY.DATE ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:MM';
            }
        }

        if (category === CATEGORY.LOCATION) {
            const hint = document.createElement('p');
            hint.className = 'spec-hint';
            hint.textContent = t.locationHint;
            field.appendChild(hint);
            // pasted embed code / links become the map link right away, and the map is shown
            control.addEventListener('change', () => {
                const result = normalizeLocation(control.value, t);
                setFieldError(field, result.error || null);
                if (!result.error) {
                    control.value = result.value;
                    showMap(field, result.value, t);
                }
            });
            const initial = normalizeLocation(value, t);
            if (!initial.error) {
                showMap(field, initial.value, t);
            }
        }
        return field;
    }

    const SpecFields = {
        // rows: [{ID, Text, spssCategoryID, Value}]
        render: function (container, rows) {
            const t = texts();
            container.innerHTML = '';
            (rows || []).forEach(row => container.appendChild(buildField(row, t)));
        },

        // The fields' values: {values: [{id, value}], error}. Wrong fields are marked
        collect: function (container) {
            const t = texts();
            const values = [];
            let error = null;
            container.querySelectorAll('.spec-field').forEach(field => {
                const control = field.querySelector('.spec-value');
                const name = field.querySelector('label').textContent;
                const category = Number(field.dataset.category);
                let value = control.value.trim();
                let message = null;

                if (category === CATEGORY.LOCATION) {
                    const result = normalizeLocation(value, t);
                    if (result.error) {
                        message = result.error;
                    } else {
                        value = result.value;
                        control.value = value;
                    }
                } else if (value !== '' && category === CATEGORY.NUM && !Number.isFinite(Number(value))) {
                    message = t.number.replace('{name}', name);
                } else if (value !== '' && category === CATEGORY.DATE && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                    message = t.date.replace('{name}', name);
                } else if (value !== '' && category === CATEGORY.DATETIME && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
                    message = t.dateTime.replace('{name}', name);
                }
                setFieldError(field, message);
                if (message) {
                    error = error || message;
                }
                values.push({ id: control.dataset.spssId, value: value });
            });
            return { values: values, error: error };
        }
    };

    // The browser steps a focused number field by one for each wheel / touchpad scroll event over it, so
    // scrolling the page after typing a price changed it (a touchpad swipe: 15000 -> 14937). The field
    // loses focus first: the value stays and the page scrolls.
    document.addEventListener('wheel', event => {
        const field = event.target;
        if (field instanceof HTMLInputElement && field.type === 'number' && field === document.activeElement) {
            field.blur();
        }
    }, { capture: true, passive: true });

    window.PriceOptions = PriceOptions;
    window.SpecFields = SpecFields;
})();
