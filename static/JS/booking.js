// Booking a price on the public pages (booking.py has the rules and works out the amount):
//   service page (slideshow.html) - each price card: who is coming (a count per age group that can
//       join), vehicle and guide choice, the price of the choice; "Book Now" opens
//       /buy-now/<ptID>-<people>?vehicle=&guide=&ages=<age ID>:<count>,...&date=<YYYY-MM-DD> and "Add to
//       cart" keeps the same choices in the cart (/cart/add, cart.py), whose page books them with the same
//       link. Every booking is for a day (booking.py booking_date_range); when the cart already has a
//       booking for that day, the client is asked first (confirmSameDay)
//   buy-now page (buy-now.html)   - the same choices; one ticket per person, each tagged with its age
//       group; the price from /booking-quote, the client's notes and the terms agreement
// Everyone counts toward the group size, the vehicle's seats and the stock, infants too.
// Data: <script type="application/json" id="bookingData"> (service page: {ptID: options}; buy-now:
// the options of its price with the chosen 'vehicle' / 'guide' / 'ageCounts') and id="bookingText" (texts).
(function () {
    'use strict';

    const PRICING_FIXED = 0, PRICING_VEHICLE = 1, PRICING_AGE = 2;

    function json(id) {
        const el = document.getElementById(id);
        return el ? JSON.parse(el.textContent) : null;
    }

    const T = json('bookingText') || {};

    function money(amount) {
        const value = Number(amount) || 0;
        return T.currency + ' ' + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }

    function fill(text, values) {
        return Object.keys(values).reduce((s, key) => s.split('{' + key + '}').join(values[key]), text);
    }

    function peopleText(n) {
        return n === 1 ? T.onePerson : fill(T.people, { num: n });
    }

    function guideByID(options, id) {
        return options.guides.find(g => g.ID === Number(id)) || null;
    }

    function vehicleByID(options, id) {
        return options.vehicles.find(v => v.ID === Number(id)) || null;
    }

    function ageByID(options, id) {
        return options.ages.find(a => a.ID === Number(id)) || null;
    }

    // ---------- Sections that open and close: who is coming, vehicle, guide ----------
    // Closed at first: the heading is a button that opens and closes the section (smoothly: the panel's one
    // grid row goes from 0fr to 1fr, booking.css .bk-fold__panel) and, while it's closed, shows the choice in
    // short. Returns {body, summary}: the section's content goes in body, summary.textContent is the short form.
    function makeFoldable(fieldset, title, id) {
        fieldset.classList.add('bk-fold');
        const legend = document.createElement('legend');
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'bk-fold__toggle';
        toggle.setAttribute('aria-controls', id);
        const heading = document.createElement('span');
        heading.className = 'bk-fold__title';
        heading.textContent = title;
        const summary = document.createElement('span');
        summary.className = 'bk-fold__summary';
        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('viewBox', '0 0 24 24');
        chevron.setAttribute('aria-hidden', 'true');
        chevron.setAttribute('class', 'bk-fold__chevron');
        chevron.innerHTML = '<path d="M6 9l6 6 6-6"/>';
        toggle.appendChild(heading);
        toggle.appendChild(summary);
        toggle.appendChild(chevron);
        legend.appendChild(toggle);
        fieldset.appendChild(legend);

        const panel = document.createElement('div');
        panel.className = 'bk-fold__panel';
        panel.id = id;
        const inner = document.createElement('div');
        inner.className = 'bk-fold__inner';
        const body = document.createElement('div');
        body.className = 'bk-fold__body';
        inner.appendChild(body);
        panel.appendChild(inner);
        fieldset.appendChild(panel);

        setFold(fieldset, false);
        toggle.addEventListener('click', () => setFold(fieldset, !fieldset.classList.contains('is-open')));
        return { body: body, summary: summary };
    }

    // opens (true) or closes a section made by makeFoldable; closed, its content can't be reached with the
    // keyboard
    function setFold(fieldset, open) {
        if (!fieldset || !fieldset.classList.contains('bk-fold')) {
            return;
        }
        fieldset.classList.toggle('is-open', open);
        fieldset.querySelector('.bk-fold__toggle').setAttribute('aria-expanded', String(open));
        fieldset.querySelector('.bk-fold__panel').inert = !open;
    }

    // A row of choice pills (radio buttons) that opens and closes: items [{value, label, sub}]; className
    // names the section (bk-vehicle, bk-guide). Closed, it shows the chosen pill's name
    function pills(name, legend, items, selected, className) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'bk-choice ' + (className || '');
        const fold = makeFoldable(fieldset, legend, name + 'Panel');
        const row = document.createElement('div');
        row.className = 'bk-pills';
        items.forEach(item => {
            const label = document.createElement('label');
            label.className = 'bk-pill';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = name;
            input.value = String(item.value);
            input.checked = String(item.value) === String(selected);
            const text = document.createElement('span');
            const main = document.createElement('strong');
            main.textContent = item.label;
            text.appendChild(main);
            if (item.sub) {
                const sub = document.createElement('small');
                sub.textContent = item.sub;
                text.appendChild(sub);
            }
            label.appendChild(input);
            label.appendChild(text);
            row.appendChild(label);
        });
        fold.body.appendChild(row);

        function showChoice() {
            const checked = row.querySelector('input:checked');
            fold.summary.textContent = checked ? checked.parentNode.querySelector('strong').textContent : T.notChosen;
            fold.summary.classList.toggle('is-empty', !checked);
        }
        showChoice();
        fieldset.addEventListener('change', showChoice);
        return fieldset;
    }

    // the guide languages, after "No guide" unless the price requires a guide
    function guideItems(options) {
        const noGuide = options.guideRequired ? [] : [{ value: 0, label: T.noGuide, sub: T.free }];
        return noGuide.concat(options.guides.map(g => ({
            value: g.ID, label: g.Language, sub: g.Price > 0 ? '+ ' + money(g.Price) : T.free
        })));
    }

    // ---------- Who is coming: a − / + counter per age group that can join ----------
    // counts: {ageID: n}. onChange(ageID, +1 / -1) asks for a change; render() shows counts and limits.
    // Opens and closes (makeFoldable); closed, it shows who is coming in short.
    function ageCounters(options, name, onChange) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'bk-choice bk-ages';
        const fold = makeFoldable(fieldset, T.whoComes, name + 'Ages');
        const inner = fold.body;
        const summary = fold.summary;

        const rows = {};
        options.ages.forEach(a => {
            const row = document.createElement('div');
            row.className = 'bk-age-row';
            const label = document.createElement('span');
            label.className = 'bk-age-name';
            label.id = name + 'age' + a.ID;
            const strong = document.createElement('strong');
            strong.textContent = a.Name;
            label.appendChild(strong);
            const sub = document.createElement('small');
            sub.textContent = [a.Range, options.basis === PRICING_AGE ? (a.Price > 0 ? fill(T.perPerson, { price: money(a.Price) }) : T.free) : '']
                .filter(Boolean).join(' · ');
            label.appendChild(sub);

            const stepper = document.createElement('div');
            stepper.className = 'bk-stepper';
            const less = document.createElement('button');
            less.type = 'button';
            less.textContent = '−';
            less.setAttribute('aria-label', T.fewer + ': ' + a.Name);
            const count = document.createElement('output');
            count.setAttribute('aria-labelledby', label.id);
            count.setAttribute('aria-live', 'polite');
            const more = document.createElement('button');
            more.type = 'button';
            more.textContent = '+';
            more.setAttribute('aria-label', T.more + ': ' + a.Name);
            less.addEventListener('click', () => onChange(a.ID, -1));
            more.addEventListener('click', () => onChange(a.ID, 1));
            stepper.appendChild(less);
            stepper.appendChild(count);
            stepper.appendChild(more);

            row.appendChild(label);
            row.appendChild(stepper);
            inner.appendChild(row);
            rows[a.ID] = { less: less, more: more, count: count };
        });

        const total = document.createElement('p');
        total.className = 'bk-age-total';
        inner.appendChild(total);

        return {
            element: fieldset,
            // opens the counters (a message about who is coming is shown)
            open: function () {
                setFold(fieldset, true);
            },
            // counts {ageID: n}; max: how many people can come (null while unknown); min: how many must stay
            // (buy-now: one ticket at least; the card can go down to nobody, so any group can be the only one)
            render: function (counts, max, min) {
                const sum = Object.values(counts).reduce((s, n) => s + n, 0);
                options.ages.forEach(a => {
                    const n = counts[a.ID] || 0;
                    const row = rows[a.ID];
                    row.count.textContent = String(n);
                    row.less.disabled = n === 0 || sum <= (min || 0);
                    row.more.disabled = max === null || sum >= max;
                });
                total.textContent = peopleText(sum);
                // closed: who is coming in short, e.g. "Adult × 2, Child × 1"
                const chosen = options.ages.filter(a => counts[a.ID]).map(a => a.Name + ' × ' + counts[a.ID]);
                summary.textContent = chosen.length ? chosen.join(', ') : peopleText(0);
            }
        };
    }

    function sumCounts(counts) {
        return Object.values(counts).reduce((s, n) => s + n, 0);
    }

    // the age group of every person, oldest groups first (the tickets' order)
    function expandCounts(options, counts) {
        const list = [];
        options.ages.slice().reverse().forEach(a => {
            for (let i = 0; i < (counts[a.ID] || 0); i++) {
                list.push(a.ID);
            }
        });
        return list;
    }

    function hasAdult(options, counts) {
        return options.ages.some(a => a.Adult && (counts[a.ID] || 0) > 0);
    }

    // the people that can come at most: the stock / order limit and the chosen vehicle's seats
    function peopleLimit(options, stockMax, vehicleID) {
        const vehicle = vehicleByID(options, vehicleID);
        if (stockMax === null) {
            return null;
        }
        return vehicle ? Math.min(stockMax, vehicle.Seats) : stockMax;
    }

    // why more can't come: the vehicle's seats or the order limit
    function limitMessage(options, stockMax, vehicleID) {
        const vehicle = vehicleByID(options, vehicleID);
        if (vehicle && vehicle.Seats <= stockMax) {
            return fill(T.seatsMax, { vehicle: vehicle.Type, seats: vehicle.Seats });
        }
        return fill(T.maxPeople, { num: stockMax });
    }

    // the price of a choice as the card shows it (the server works out the real one)
    function cardPrice(options, counts, vehicleID, guideID) {
        const guide = guideByID(options, guideID);
        const guidePrice = guide ? guide.Price : 0;
        if (options.basis === PRICING_VEHICLE) {
            const vehicle = vehicleByID(options, vehicleID);
            return vehicle ? vehicle.Price + guidePrice : null;
        }
        if (options.basis === PRICING_AGE) {
            return options.ages.reduce((s, a) => s + (a.Price || 0) * (counts[a.ID] || 0), 0) + guidePrice;
        }
        return options.price * sumCounts(counts) + guidePrice;
    }

    // the number of bookings in the cart, on the headers' suitcase (templates/_cart_link.html)
    function setCartCount(count) {
        document.querySelectorAll('[data-cart-count]').forEach(el => {
            el.textContent = String(count);
            el.hidden = !count;
            const link = el.closest('[data-cart-link]');
            if (link) {
                link.setAttribute('aria-label', link.dataset.label + (count ? ' (' + count + ')' : ''));
                link.classList.remove('is-bumped');
                void link.offsetWidth;   // restart the animation
                link.classList.add('is-bumped');
            }
        });
    }

    // ---------- The day of the booking ----------
    // 'YYYY-MM-DD' as the page's language writes it, e.g. "Saturday, 24 October 2026"
    function formatDay(day) {
        const value = new Date(day + 'T00:00:00');
        try {
            return value.toLocaleDateString(document.documentElement.lang || undefined,
                { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } catch (error) {
            return day;
        }
    }

    // the date field: a native date picker limited to the days the price can be booked for
    function dateField(name, options, value) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'bk-choice bk-date';
        const legend = document.createElement('legend');
        legend.id = name + 'DateLabel';
        legend.textContent = T.date;
        fieldset.appendChild(legend);
        const input = document.createElement('input');
        input.type = 'date';
        input.name = name + 'date';
        input.className = 'bk-date-input';
        input.required = true;
        input.min = options.dateMin;
        input.max = options.dateMax;
        input.value = value || '';
        input.setAttribute('aria-labelledby', legend.id);
        fieldset.appendChild(input);
        return { element: fieldset, input: input };
    }

    // ---------- The client's notes (when the price takes them: Add / Edit Price "Additional notes") ----------
    // Written on the price card and carried to the buy-now page in this browser (localStorage, not in the link
    // or the cart cookie: they can be long and personal): under 'cart:<item id>' for a cart item and
    // 'pt:<ptRefKey>' for "Book Now". Without storage the buy-now page's field just starts empty.
    const noteStore = {
        get: function (key) {
            try {
                return localStorage.getItem('araxiNotes:' + key) || '';
            } catch (error) {
                return '';
            }
        },
        set: function (key, text) {
            try {
                if (text) {
                    localStorage.setItem('araxiNotes:' + key, text);
                } else {
                    localStorage.removeItem('araxiNotes:' + key);
                }
            } catch (error) {
                // no storage: nothing to carry
            }
        }
    };

    // the notes field of the price card ("*" when they are required)
    function notesField(name, options) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'bk-choice bk-notes-field';
        const legend = document.createElement('legend');
        legend.id = name + 'NotesLabel';
        legend.textContent = T.notes + (options.notesRequired ? ' *' : '');
        fieldset.appendChild(legend);
        const input = document.createElement('textarea');
        input.name = name + 'notes';
        input.className = 'bk-notes-input';
        input.rows = 3;
        input.maxLength = 2000;
        input.required = !!options.notesRequired;
        input.placeholder = T.notesPlaceholder;
        input.setAttribute('aria-labelledby', legend.id);
        fieldset.appendChild(input);
        return { element: fieldset, input: input };
    }

    // a day the price can be booked for, or '' (the browser's picker keeps to min / max, typing may not)
    function validDay(options, value) {
        return value && value >= options.dateMin && value <= options.dateMax ? value : '';
    }

    // "Are you sure?" when the cart already has bookings for the same day (titles). Resolves true to go on
    let dialog = null;
    function confirmSameDay(day, titles) {
        if (typeof HTMLDialogElement !== 'function') {
            return Promise.resolve(window.confirm(fill(T.sameDayText, { date: formatDay(day) }) + '\n' +
                titles.join('\n') + '\n\n' + T.sameDayQuestion));
        }
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.className = 'bk-dialog';
            dialog.setAttribute('aria-labelledby', 'bkDialogTitle');
            dialog.innerHTML = '<form method="dialog"><h2 id="bkDialogTitle"></h2><p class="bk-dialog__text"></p>' +
                '<ul class="bk-dialog__list"></ul><p class="bk-dialog__question"></p><div class="bk-dialog__actions">' +
                '<button type="submit" class="bk-btn" value="no" autofocus></button>' +
                '<button type="submit" class="bk-btn bk-btn--solid" value="yes"></button></div></form>';
            dialog.querySelector('h2').textContent = T.sameDayTitle;
            dialog.querySelector('.bk-dialog__question').textContent = T.sameDayQuestion;
            dialog.querySelector('[value="no"]').textContent = T.otherDay;
            dialog.querySelector('[value="yes"]').textContent = T.sameDayYes;
            // a click on the backdrop: no
            dialog.addEventListener('click', event => {
                if (event.target === dialog) {
                    dialog.close('no');
                }
            });
            document.body.appendChild(dialog);
        }
        dialog.querySelector('.bk-dialog__text').textContent = fill(T.sameDayText, { date: formatDay(day) });
        const list = dialog.querySelector('.bk-dialog__list');
        list.innerHTML = '';
        titles.forEach(title => {
            const li = document.createElement('li');
            li.textContent = title;
            list.appendChild(li);
        });
        dialog.returnValue = '';
        dialog.showModal();
        return new Promise(resolve => {
            dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
        });
    }

    // true when nothing else in the cart is for that day, or the client says it's fine. Not counted: the cart
    // item exceptID (being booked from the cart), and the same booking as the choices params (URLSearchParams
    // with ptID) when it is in the cart
    function sameDayOK(day, exceptID, params) {
        const formData = new FormData();
        if (params) {
            params.forEach((value, key) => formData.append(key, value));
        }
        formData.set('date', day);
        formData.append('except', exceptID || '');
        return fetch('/cart/date-check', { method: 'POST', headers: { 'X-CSRFToken': T.csrf }, body: formData })
            .then(response => response.json())
            .then(answer => {
                T.csrf = answer.newCSRFtoken || T.csrf;
                return answer.items && answer.items.length ? confirmSameDay(day, answer.items) : true;
            })
            .catch(error => {
                console.error(error);
                return true;
            });
    }

    // the first adult group that can join, else the first group
    function defaultCounts(options) {
        const first = options.ages.find(a => a.Adult) || options.ages[0];
        return first ? { [first.ID]: 1 } : {};
    }

    // ================= Service page: the price cards =================
    function initServicePage(all) {
        document.querySelectorAll('[data-booking]').forEach(box => {
            const options = all[box.dataset.booking];
            if (!options) {
                return;
            }
            const card = box.closest('.productType');
            const name = 'bk' + options.ptRefKey;
            let selectedVehicle = options.vehicles.length === 1 ? options.vehicles[0].ID : null;
            let selectedGuide = options.defaultGuide;
            const counts = defaultCounts(options);

            // the people dropdown of the card (filled with 1..stock by slideshow.js) gives the limit and
            // keeps the total; the counters replace it
            const select = card.querySelector('select.quantity');
            const cartBox = select ? select.parentNode : null;
            if (cartBox) {
                cartBox.classList.add('bk-counted');
            }
            function stockMax() {
                const s = card.querySelector('select.quantity');
                return s && s.options.length ? s.options.length : null;
            }

            let selectedDate = '';
            const day = options.dateMin ? dateField(name, options, '') : null;
            if (day) {
                box.appendChild(day.element);
            }

            const counters = ageCounters(options, name, (ageID, step) => {
                const max = peopleLimit(options, stockMax(), selectedVehicle);
                if (step > 0 && max !== null && sumCounts(counts) >= max) {
                    showMessage(limitMessage(options, stockMax(), selectedVehicle));
                    return;
                }
                counts[ageID] = Math.max(0, (counts[ageID] || 0) + step);
                showMessage('');
                update();
            });
            if (options.ages.length) {
                box.appendChild(counters.element);
            }
            if (options.basis === PRICING_VEHICLE && options.vehicles.length) {
                box.appendChild(pills(name + 'vehicle', T.vehicle, options.vehicles.map(v => ({
                    value: v.ID, label: v.Type, sub: v.SeatsLabel + ' · ' + (v.Price > 0 ? money(v.Price) : T.free)
                })), selectedVehicle, 'bk-vehicle'));
            }
            if (options.guides.length) {
                box.appendChild(pills(name + 'guide', T.guide, guideItems(options), selectedGuide, 'bk-guide'));
            }
            const notes = options.notesEnabled ? notesField(name, options) : null;
            if (notes) {
                box.appendChild(notes.element);
                notes.input.addEventListener('input', () => notes.input.classList.remove('is-invalid'));
            }
            const message = document.createElement('p');
            message.className = 'bk-message';
            message.setAttribute('role', 'alert');
            box.appendChild(message);

            const priceEl = card.querySelector('.price');

            // a smaller vehicle: the group shrinks to its seats (the youngest go first)
            function fitLimit() {
                const max = peopleLimit(options, stockMax(), selectedVehicle);
                if (max === null) {
                    return;
                }
                const order = options.ages.map(a => a.ID);
                while (sumCounts(counts) > Math.max(max, 1)) {
                    const id = order.find(i => (counts[i] || 0) > 0);
                    counts[id] -= 1;
                }
            }

            function update() {
                fitLimit();
                counters.render(counts, peopleLimit(options, stockMax(), selectedVehicle), 0);
                const people = sumCounts(counts);
                const s = card.querySelector('select.quantity');
                if (s && s.options.length && people > 0) {
                    s.value = String(Math.min(people, s.options.length));
                }
                if (people > 0 && options.adultRequired && !hasAdult(options, counts)) {
                    showMessage(T.adultRequired);
                }
                if (priceEl) {
                    const price = cardPrice(options, counts, selectedVehicle, selectedGuide);
                    if (price === null || people === 0) {
                        // the cheapest booking the price takes (booking.py lowest_total); null: none can be made
                        if (options.from !== null) {
                            priceEl.textContent = options.from > 0 ? fill(T.fromPrice, { price: money(options.from) }) : T.participationFree;
                        }
                    } else {
                        priceEl.textContent = price > 0 ? money(price) : T.participationFree;
                    }
                }
            }

            box.addEventListener('change', event => {
                if (event.target.name === name + 'date') {
                    selectedDate = validDay(options, event.target.value);
                    event.target.classList.toggle('is-invalid', !selectedDate && !!event.target.value);
                    showMessage(selectedDate || !event.target.value ? '' : T.dateUnavailable);
                }
                if (event.target.name === name + 'vehicle') {
                    selectedVehicle = Number(event.target.value);
                    showMessage('');
                }
                if (event.target.name === name + 'guide') {
                    selectedGuide = Number(event.target.value);
                }
                update();
            });

            if (select) {
                // the options (1..stock) arrive later (slideshow.js); no stock: the dropdown is replaced
                new MutationObserver(update).observe(select, { childList: true });
                if (cartBox) {
                    new MutationObserver(() => {
                        counters.element.hidden = !card.querySelector('select.quantity');
                    }).observe(cartBox, { childList: true });
                }
            }
            update();

            function showMessage(text, success) {
                message.classList.toggle('is-success', !!success);
                message.textContent = text;
            }

            // the card's choices, as "Book Now" and "Add to cart" send them; null (and the reason shown)
            // when something is missing
            function choices() {
                const people = sumCounts(counts);
                if (stockMax() === null) {
                    return null;
                }
                if (!selectedDate) {
                    showMessage(day ? T.chooseDate : T.dateUnavailable);
                    if (day) {
                        day.input.classList.add('is-invalid');
                        day.input.focus();
                    }
                    return null;
                }
                if (people < 1) {
                    showMessage(T.chooseWho);
                    counters.open();
                    return null;
                }
                if (options.basis === PRICING_VEHICLE && !vehicleByID(options, selectedVehicle)) {
                    showMessage(T.chooseVehicle);
                    setFold(box.querySelector('.bk-vehicle'), true);
                    return null;
                }
                if (options.adultRequired && !hasAdult(options, counts)) {
                    showMessage(T.adultRequired);
                    counters.open();
                    return null;
                }
                if (notes && notes.input.required && !notes.input.value.trim()) {
                    showMessage(T.writeNotes);
                    notes.input.classList.add('is-invalid');
                    notes.input.focus();
                    return null;
                }
                const params = new URLSearchParams();
                if (options.basis === PRICING_VEHICLE) {
                    params.set('vehicle', selectedVehicle);
                }
                params.set('guide', selectedGuide);
                params.set('ages', Object.keys(counts).filter(id => counts[id] > 0).map(id => id + ':' + counts[id]).join(','));
                params.set('date', selectedDate);
                return { people: people, params: params, notes: notes ? notes.input.value.trim() : '' };
            }

            // "Book Now": the buy-now page with the choices
            const bookBtn = card.querySelector('.buy-btn');
            if (bookBtn) {
                bookBtn.onclick = null;
                bookBtn.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const chosen = choices();
                    if (!chosen || bookBtn.disabled) {
                        return;
                    }
                    bookBtn.disabled = true;
                    const check = new URLSearchParams(chosen.params);
                    check.set('ptID', options.ptRefKey);
                    sameDayOK(selectedDate, '', check).then(ok => {
                        bookBtn.disabled = false;
                        if (ok) {
                            noteStore.set('pt:' + options.ptRefKey, chosen.notes);
                            window.location.href = '/buy-now/' + options.ptRefKey + '-' + chosen.people + '?' + chosen.params.toString();
                        } else {
                            day.input.focus();
                        }
                    });
                });
            }

            // "Add to cart": the choices are kept in the cart (POST /cart/add, cart.py), the header's
            // suitcase shows the new number
            const cartBtn = card.querySelector('[data-cart-add]');
            if (cartBtn) {
                cartBtn.addEventListener('click', () => {
                    const chosen = choices();
                    if (!chosen || cartBtn.disabled) {
                        return;
                    }
                    cartBtn.disabled = true;
                    // the server answers status 3 with the cart's other bookings for that day: ask, then send
                    // again with sameDay=1
                    function add(sameDay) {
                        const formData = new FormData();
                        formData.append('ptID', options.ptRefKey);
                        chosen.params.forEach((value, key) => formData.append(key, value));
                        if (sameDay) {
                            formData.append('sameDay', '1');
                        }
                        return fetch('/cart/add', { method: 'POST', headers: { 'X-CSRFToken': T.csrf }, body: formData })
                            .then(response => response.json())
                            .then(answer => {
                                T.csrf = answer.newCSRFtoken || T.csrf;
                                if (answer.status !== '3') {
                                    return answer;
                                }
                                return confirmSameDay(selectedDate, answer.items).then(ok => ok ? add(true) : null);
                            });
                    }
                    add(false)
                        .then(answer => {
                            if (!answer) {
                                day.input.focus();
                                return;
                            }
                            if (answer.status === '0') {
                                showMessage(answer.answer);
                                return;
                            }
                            if (answer.id) {
                                noteStore.set('cart:' + answer.id, chosen.notes);
                            }
                            showMessage(answer.answer, true);
                            const link = document.createElement('a');
                            link.href = '/cart';
                            link.textContent = T.viewCart;
                            message.appendChild(document.createTextNode(' '));
                            message.appendChild(link);
                            setCartCount(answer.count);
                            const label = cartBtn.querySelector('[data-cart-label]');
                            cartBtn.classList.add('is-added');
                            if (label) {
                                label.textContent = T.added;
                            }
                            setTimeout(() => {
                                cartBtn.classList.remove('is-added');
                                if (label) {
                                    label.textContent = T.cart;
                                }
                            }, 2000);
                        })
                        .catch(error => {
                            showMessage(T.tryAgain);
                            console.error(error);
                        })
                        .finally(() => {
                            cartBtn.disabled = false;
                        });
                });
            }

            // a new choice: the "added" note is out of date
            box.addEventListener('change', () => {
                if (message.classList.contains('is-success')) {
                    showMessage('');
                }
            });
        });

        // "Book Now" in the photo header: to the prices
        document.querySelectorAll('[data-book-now]').forEach(btn => {
            btn.addEventListener('click', () => {
                const details = document.querySelector('.product-details');
                const shown = [...document.querySelectorAll('.productType')].find(b => b.style.display !== 'none');
                if (details && shown) {
                    details.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    const first = shown.querySelector('input, select, button');
                    if (first) {
                        first.focus({ preventScroll: true });
                    }
                }
            });
        });
    }

    // ================= Buy-now page =================
    // The page makes one ticket (.client-contact) per person and adds / removes them with its + / −
    // (.tkt-add / .tkt-remove). Here the counters do that: every ticket is tagged with an age group
    // (data-age), and the counts are the tags.
    function initBuyNow(options) {
        const contacts = document.querySelector('.client-contacts');
        const card = document.getElementById('bookingCard');
        if (!contacts || !card) {
            return null;
        }
        contacts.classList.add('bk-managed');
        let vehicle = options.vehicle;
        let guide = options.guide;
        let lastQuote = null;
        let lastError = null;
        let quoteRequest = 0;
        let stockMax = null;
        // age groups waiting for a ticket: the chosen ones at first, then the ones added with +
        let waiting = expandCounts(options, options.ageCounts || {});
        let waitingTimer = null;

        function tickets() {
            return [...contacts.querySelectorAll('.client-contact')];
        }

        // the counts: the tickets' age groups and the ones waiting for a ticket
        function counts() {
            const c = {};
            tickets().forEach(t => {
                const id = Number(t.dataset.age);
                if (id) {
                    c[id] = (c[id] || 0) + 1;
                }
            });
            waiting.forEach(id => { c[id] = (c[id] || 0) + 1; });
            return c;
        }

        // ---- the day: the one chosen on the service page, changeable here. Another day that the cart
        // already has a booking for is asked about (the cart item being booked doesn't count)
        let bookingDay = options.dateMin ? validDay(options, options.date) : '';
        const day = options.dateMin ? dateField('bkNow', options, bookingDay) : null;
        if (day) {
            card.appendChild(day.element);
            day.input.addEventListener('change', () => {
                const value = validDay(options, day.input.value);
                day.input.classList.toggle('is-invalid', !value);
                if (!value) {
                    bookingDay = '';
                    showMessage(day.input.value ? T.dateUnavailable : '');
                    return;
                }
                sameDayOK(value, options.cartItem).then(ok => {
                    if (ok) {
                        bookingDay = value;
                        showMessage('');
                    } else {
                        day.input.value = bookingDay;
                        day.input.focus();
                    }
                });
            });
        }

        // ---- who is coming, vehicle and guide
        const counters = ageCounters(options, 'bkNow', (ageID, step) => {
            const max = peopleLimit(options, stockMax, vehicle);
            if (step > 0) {
                if (max === null || sumCounts(counts()) >= max) {
                    lastError = limitMessage(options, stockMax, vehicle);
                    showMessage(lastError);
                    return;
                }
                waiting.push(ageID);
                addTicket();
            } else {
                // the last ticket of this age group goes
                const own = tickets().filter(t => Number(t.dataset.age) === ageID);
                const ticket = own[own.length - 1];
                if (ticket && tickets().length > 1) {
                    ticket.querySelector('.tkt-remove').click();
                }
            }
            render();
        });
        card.appendChild(counters.element);
        if (options.basis === PRICING_VEHICLE) {
            card.appendChild(pills('bkVehicle', T.vehicle, options.vehicles.map(v => ({
                value: v.ID, label: v.Type, sub: v.SeatsLabel + ' · ' + (v.Price > 0 ? money(v.Price) : T.free)
            })), vehicle, 'bk-vehicle'));
        }
        if (options.guides.length) {
            card.appendChild(pills('bkGuide', T.guide, guideItems(options), guide, 'bk-guide'));
        }
        card.hidden = card.children.length === 0;
        card.addEventListener('change', event => {
            if (event.target.name === 'bkVehicle') {
                vehicle = Number(event.target.value);
                card.querySelector('.bk-vehicle').classList.remove('invalid');
                // a smaller vehicle: the youngest go first
                const max = peopleLimit(options, stockMax, vehicle);
                if (max !== null) {
                    const order = options.ages.map(a => a.ID);
                    while (tickets().length > Math.max(max, 1)) {
                        const id = order.find(i => tickets().some(t => Number(t.dataset.age) === i));
                        const own = tickets().filter(t => Number(t.dataset.age) === id);
                        own[own.length - 1].querySelector('.tkt-remove').click();
                    }
                }
            }
            if (event.target.name === 'bkGuide') {
                guide = Number(event.target.value);
            }
            render();
            refresh();
        });

        // tickets the page couldn't add (no stock) aren't waited for
        function waitForTickets() {
            clearTimeout(waitingTimer);
            waitingTimer = setTimeout(() => {
                waiting = [];
                render();
                refresh();
            }, 6000);
        }

        // a ticket more: the page's own + (it checks the stock), done once the ticket is there
        function addTicket() {
            const add = contacts.querySelector('.tkt-add');
            if (add) {
                add.click();
            }
            waitForTickets();
        }

        // the stock / order limit, as the page works it out
        const stockData = new FormData();
        stockData.append('ptID', options.ptRefKey);
        stockData.append('quantity', 1);
        fetch('/get-pt-quantity', { method: 'POST', headers: { 'X-CSRFToken': T.csrf }, body: stockData })
            .then(response => response.json())
            .then(answer => {
                const row = answer && answer.data && answer.data.data && answer.data.data[0];
                if (row) {
                    const inStock = parseInt(row.quantity, 10) || 0;
                    stockMax = row.maxQuantity === null ? inStock : Math.min(parseInt(row.maxQuantity, 10), inStock);
                }
                render();
            })
            .catch(error => console.error(error));

        // every ticket gets its age group (tag and label)
        function tagTickets() {
            tickets().forEach(t => {
                if (!t.dataset.age) {
                    const next = waiting.shift();
                    const fallback = (options.ages.find(a => a.Adult) || options.ages[0] || {}).ID;
                    t.dataset.age = String(next || fallback || '');
                }
                let tag = t.querySelector('.bk-age-tag');
                if (!tag) {
                    tag = document.createElement('p');
                    tag.className = 'col-12 bk-age-tag';
                    t.insertBefore(tag, t.firstChild);
                }
                const age = ageByID(options, t.dataset.age);
                tag.textContent = T.ageGroup + ': ' + (age ? age.Name + (age.Range ? ' (' + age.Range + ')' : '') : '');
            });
            if (!waiting.length) {
                clearTimeout(waitingTimer);
            }
        }

        function render() {
            counters.render(counts(), peopleLimit(options, stockMax, vehicle), 1);
        }

        function showMessage(text) {
            const mistakes = document.getElementById('mistakes');
            if (mistakes) {
                mistakes.textContent = text;
                mistakes.style.display = text ? 'block' : 'none';
                if (text) {
                    mistakes.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }

        // ---- the price of the booking (/booking-quote)
        const summary = document.getElementById('booking-summary');

        // error: why the booking can't be priced (e.g. too many people for the vehicle)
        function showQuote(quote, error) {
            lastQuote = quote;
            summary.innerHTML = '';
            if (!quote) {
                const li = document.createElement('li');
                li.className = 'list-group-item bk-pending' + (error ? ' bk-error' : '');
                li.textContent = error || T.chooseOptions;
                summary.appendChild(li);
                // the basket line shows Price x people until the booking's price is known
                document.querySelectorAll('#checkout-basket .text-muted').forEach(el => { el.textContent = '—'; });
                return;
            }
            quote.lines.forEach(line => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between';
                const label = document.createElement('span');
                label.textContent = line.label;
                const amount = document.createElement('span');
                amount.textContent = line.amount > 0 ? money(line.amount) : T.free;
                li.appendChild(label);
                li.appendChild(amount);
                summary.appendChild(li);
            });
            const total = document.createElement('li');
            total.className = 'list-group-item d-flex justify-content-between bk-total';
            const label = document.createElement('strong');
            label.textContent = T.total;
            const amount = document.createElement('strong');
            amount.id = 'booking-total';
            amount.textContent = money(quote.total);
            total.appendChild(label);
            total.appendChild(amount);
            summary.appendChild(total);

            // the basket line and the hidden total the page already has
            document.querySelectorAll('#checkout-basket .text-muted').forEach(el => { el.textContent = money(quote.total); });
            const checkoutTotal = document.getElementById('checkout-total-price');
            if (checkoutTotal) {
                checkoutTotal.textContent = money(quote.total);
            }
            // payment (and promo codes) only when there is something to pay
            const pay = quote.total > 0;
            document.querySelectorAll('.paymentElements').forEach(el => { el.style.display = pay ? '' : 'none'; });
            // the summary is in the right column, which the page hides when the price itself is free
            const promo = document.getElementById('promo-container');
            if (promo) {
                promo.style.display = '';
                promo.querySelectorAll('.card').forEach(el => { el.style.display = pay ? '' : 'none'; });
            }
        }

        // the age group of every ticket, in the tickets' order
        function ages() {
            return tickets().map(t => Number(t.dataset.age) || 0);
        }

        function refresh() {
            const people = tickets().length;
            // tickets still being added
            if (!people || waiting.length) {
                return;
            }
            if (options.basis === PRICING_VEHICLE && !vehicleByID(options, vehicle)) {
                showQuote(null);
                return;
            }
            const request = ++quoteRequest;
            const formData = new FormData();
            formData.append('ptID', options.ptRefKey);
            formData.append('people', people);
            formData.append('vehicle', vehicle || '');
            formData.append('guide', guide || 0);
            formData.append('ages', ages().join(','));
            fetch('/booking-quote', { method: 'POST', headers: { 'X-CSRFToken': T.csrf }, body: formData })
                .then(response => response.json())
                .then(answer => {
                    if (request !== quoteRequest) {
                        return;   // an older answer
                    }
                    if (answer.status === '1') {
                        showQuote(answer);
                        if (lastError) {
                            showMessage('');   // the problem shown before is solved
                            lastError = null;
                        }
                    } else {
                        showQuote(null, answer.answer);
                        lastError = answer.answer;
                        showMessage(answer.answer);
                    }
                })
                .catch(error => console.error(error));
        }

        // tickets are added and removed by the page: tag them, update the counters and the price
        new MutationObserver(() => {
            tagTickets();
            render();
            refresh();
        }).observe(contacts, { childList: true, subtree: false });
        tagTickets();
        render();
        showQuote(null);
        // the page makes the first tickets a moment later
        if (waiting.length) {
            waitForTickets();
        }

        // ---- notes (as written on the price card, noteStore) and terms
        const notes = document.getElementById('bookingNotes');
        const terms = document.getElementById('bookingTerms');
        const notesKey = options.cartItem ? 'cart:' + options.cartItem : 'pt:' + options.ptRefKey;
        if (notes) {
            notes.value = notes.value || noteStore.get(notesKey);
            notes.addEventListener('input', () => {
                notes.classList.remove('is-invalid');
                noteStore.set(notesKey, notes.value.trim());
            });
        }
        if (terms) {
            terms.addEventListener('change', () => terms.classList.remove('is-invalid'));
        }

        return {
            refresh: refresh,

            // Marks what is missing; true when the booking can be sent
            validate: function () {
                let ok = true;
                if (options.basis === PRICING_VEHICLE && !vehicleByID(options, vehicle)) {
                    const choice = card.querySelector('.bk-vehicle');
                    if (choice) {
                        choice.classList.add('invalid');
                        setFold(choice, true);
                    }
                    ok = false;
                }
                if (options.adultRequired && !hasAdult(options, counts())) {
                    showMessage(T.adultRequired);
                    counters.open();
                    ok = false;
                }
                if (!bookingDay) {
                    if (day) {
                        day.input.classList.add('is-invalid');
                    }
                    showMessage(day ? T.chooseDate : T.dateUnavailable);
                    ok = false;
                }
                if (notes && notes.required && !notes.value.trim()) {
                    notes.classList.add('is-invalid');
                    ok = false;
                }
                if (terms && !terms.checked) {
                    terms.classList.add('is-invalid');
                    ok = false;
                }
                return ok;
            },

            collect: function () {
                return {
                    vehicle: vehicle || null,
                    guide: guide || 0,
                    date: bookingDay,
                    ages: ages(),
                    notes: notes ? notes.value.trim() : '',
                    terms: terms ? terms.checked : false
                };
            },

            total: function () {
                return lastQuote ? lastQuote.total : null;
            },

            // the order is placed: the notes kept for it aren't needed any more
            booked: function () {
                noteStore.set(notesKey, '');
            }
        };
    }

    document.addEventListener('DOMContentLoaded', () => {
        const data = json('bookingData');
        if (!data) {
            return;
        }
        if (document.getElementById('bookingCard')) {
            window.BookingPage = initBuyNow(data);
        } else {
            initServicePage(data);
        }
    });
})();
