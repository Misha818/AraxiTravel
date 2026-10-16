// Booking a price on the public pages (booking.py has the rules and works out the amount):
//   service page (slideshow.html) - each price card: who is coming (a count per age group that can
//       join), vehicle and guide choice, the price of the choice; "Book Now" opens
//       /buy-now/<ptID>-<people>?vehicle=&guide=&ages=<age ID>:<count>,... and "Add to cart" keeps the
//       same choices in the cart (/cart/add, cart.py), whose page books them with the same link
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

    // A row of choice pills (radio buttons): items [{value, label, sub}]
    function pills(name, legend, items, selected) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'bk-choice';
        const title = document.createElement('legend');
        title.textContent = legend;
        fieldset.appendChild(title);
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
        fieldset.appendChild(row);
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
    function ageCounters(options, name, onChange) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'bk-choice bk-ages';
        const legend = document.createElement('legend');
        legend.textContent = T.whoComes;
        fieldset.appendChild(legend);

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
            fieldset.appendChild(row);
            rows[a.ID] = { less: less, more: more, count: count };
        });

        const total = document.createElement('p');
        total.className = 'bk-age-total';
        fieldset.appendChild(total);

        return {
            element: fieldset,
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
                })), selectedVehicle));
            }
            if (options.guides.length) {
                box.appendChild(pills(name + 'guide', T.guide, guideItems(options), selectedGuide));
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
                        priceEl.textContent = fill(T.fromPrice, { price: money(options.from) });
                    } else {
                        priceEl.textContent = price > 0 ? money(price) : T.participationFree;
                    }
                }
            }

            box.addEventListener('change', event => {
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
                if (people < 1) {
                    showMessage(T.chooseWho);
                    return null;
                }
                if (options.basis === PRICING_VEHICLE && !vehicleByID(options, selectedVehicle)) {
                    showMessage(T.chooseVehicle);
                    return null;
                }
                if (options.adultRequired && !hasAdult(options, counts)) {
                    showMessage(T.adultRequired);
                    return null;
                }
                const params = new URLSearchParams();
                if (options.basis === PRICING_VEHICLE) {
                    params.set('vehicle', selectedVehicle);
                }
                params.set('guide', selectedGuide);
                params.set('ages', Object.keys(counts).filter(id => counts[id] > 0).map(id => id + ':' + counts[id]).join(','));
                return { people: people, params: params };
            }

            // "Book Now": the buy-now page with the choices
            const bookBtn = card.querySelector('.buy-btn');
            if (bookBtn) {
                bookBtn.onclick = null;
                bookBtn.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const chosen = choices();
                    if (chosen) {
                        window.location.href = '/buy-now/' + options.ptRefKey + '-' + chosen.people + '?' + chosen.params.toString();
                    }
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
                    const formData = new FormData();
                    formData.append('ptID', options.ptRefKey);
                    chosen.params.forEach((value, key) => formData.append(key, value));
                    fetch('/cart/add', { method: 'POST', headers: { 'X-CSRFToken': T.csrf }, body: formData })
                        .then(response => response.json())
                        .then(answer => {
                            T.csrf = answer.newCSRFtoken || T.csrf;
                            if (answer.status === '0') {
                                showMessage(answer.answer);
                                return;
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
            })), vehicle));
        }
        if (options.guides.length) {
            card.appendChild(pills('bkGuide', T.guide, guideItems(options), guide));
        }
        card.hidden = card.children.length === 0;
        card.addEventListener('change', event => {
            if (event.target.name === 'bkVehicle') {
                vehicle = Number(event.target.value);
                card.querySelector('.bk-choice:not(.bk-ages)').classList.remove('invalid');
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

        // ---- notes and terms
        const notes = document.getElementById('bookingNotes');
        const terms = document.getElementById('bookingTerms');
        if (notes) {
            notes.addEventListener('input', () => notes.classList.remove('is-invalid'));
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
                    const choice = card.querySelector('.bk-choice:not(.bk-ages)');
                    if (choice) {
                        choice.classList.add('invalid');
                    }
                    ok = false;
                }
                if (options.adultRequired && !hasAdult(options, counts())) {
                    showMessage(T.adultRequired);
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
                    ages: ages(),
                    notes: notes ? notes.value.trim() : '',
                    terms: terms ? terms.checked : false
                };
            },

            total: function () {
                return lastQuote ? lastQuote.total : null;
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
