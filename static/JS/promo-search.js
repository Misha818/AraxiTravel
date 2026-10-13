// Search for the promo code forms (create-promo-code.html and edit-promo-code.html):
// - the Affiliate <select> gets a searchable dropdown in front of it. The <select> stays in the
//   page (hidden) and keeps the value: picking an affiliate sets it and fires its "change" event,
//   so the forms' own code works as before
// - the Services list gets a search box at its top that filters services by their name or the
//   names of their prices
// Visible texts come from the template's data-search / data-no-matches attributes (translated)
document.addEventListener('DOMContentLoaded', () => {
    const affiliateSelect = document.querySelector('.promo-edit-form select#affiliates');
    if (affiliateSelect) {
        searchableSelect(affiliateSelect);
    }

    const servicesList = document.getElementById('parent-options');
    if (servicesList) {
        servicesSearch(servicesList);
    }
});


function searchableSelect(select) {
    const searchText = select.dataset.search || 'Search...';
    const noMatchesText = select.dataset.noMatches || 'No matches';

    const wrapper = document.createElement('div');
    wrapper.className = 'search-select';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'search-select-toggle';
    toggle.id = select.id + '-toggle';
    toggle.setAttribute('aria-haspopup', 'listbox');
    toggle.setAttribute('aria-expanded', 'false');
    const toggleText = document.createElement('span');
    toggleText.className = 'search-select-text';
    const chevron = document.createElement('i');
    chevron.className = 'fas fa-chevron-down';
    chevron.setAttribute('aria-hidden', 'true');
    toggle.append(toggleText, chevron);

    const panel = document.createElement('div');
    panel.className = 'search-select-panel';
    panel.hidden = true;

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'search-select-input';
    search.placeholder = searchText;
    search.setAttribute('aria-label', searchText);
    search.autocomplete = 'off';

    const list = document.createElement('ul');
    list.className = 'search-select-list';
    list.setAttribute('role', 'listbox');
    list.id = select.id + '-listbox';
    search.setAttribute('aria-controls', list.id);

    const empty = document.createElement('div');
    empty.className = 'search-select-empty';
    empty.textContent = noMatchesText;
    empty.hidden = true;

    panel.append(search, list, empty);
    wrapper.append(toggle, panel);
    select.parentNode.insertBefore(wrapper, select);
    select.hidden = true;
    select.tabIndex = -1;

    // the field's label now points at the visible button
    const label = document.querySelector(`label[for="${select.id}"]`);
    if (label) {
        label.htmlFor = toggle.id;
    }

    let active = -1;   // highlighted item while using the arrow keys

    // the <select>'s options are the list ("Select an affiliate" included, to clear the choice)
    const items = [...select.options].map(option => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.dataset.value = option.value;
        li.textContent = option.textContent.trim();
        li.addEventListener('mousedown', event => event.preventDefault());   // keep focus in the search box
        li.addEventListener('click', () => choose(option.value));
        list.appendChild(li);
        return li;
    });

    function showSelected() {
        const option = select.options[select.selectedIndex];
        toggleText.textContent = option ? option.textContent.trim() : '';
        wrapper.classList.toggle('has-value', !!select.value);
        items.forEach(li => li.setAttribute('aria-selected', String(li.dataset.value === select.value)));
    }

    function visibleItems() {
        return items.filter(li => !li.hidden);
    }

    function highlight(index) {
        const visible = visibleItems();
        items.forEach(li => li.classList.remove('is-active'));
        active = visible.length ? Math.max(0, Math.min(index, visible.length - 1)) : -1;
        if (active >= 0) {
            visible[active].classList.add('is-active');
            visible[active].scrollIntoView({ block: 'nearest' });
        }
    }

    function filter() {
        const query = search.value.trim().toLowerCase();
        items.forEach(li => {
            li.hidden = query !== '' && !li.textContent.toLowerCase().includes(query);
        });
        empty.hidden = visibleItems().length > 0;
        highlight(0);
    }

    function open() {
        panel.hidden = false;
        wrapper.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
        search.value = '';
        filter();
        // start on the current choice
        const current = visibleItems().findIndex(li => li.dataset.value === select.value);
        highlight(current >= 0 ? current : 0);
        search.focus();
    }

    function close(focusToggle = false) {
        if (panel.hidden) {
            return;
        }
        panel.hidden = true;
        wrapper.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        if (focusToggle) {
            toggle.focus();
        }
    }

    function choose(value) {
        const changed = select.value !== value;
        select.value = value;
        showSelected();
        close(true);
        if (changed) {
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    toggle.addEventListener('click', () => (panel.hidden ? open() : close()));
    toggle.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open();
        }
    });

    search.addEventListener('input', filter);
    search.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            highlight(active + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            highlight(active - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const visible = visibleItems();
            if (active >= 0 && visible[active]) {
                choose(visible[active].dataset.value);
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
        } else if (event.key === 'Tab') {
            close();
        }
    });

    document.addEventListener('click', event => {
        if (!wrapper.contains(event.target)) {
            close();
        }
    });

    // a value set by code elsewhere still shows on the button
    select.addEventListener('change', showSelected);
    showSelected();
}


function servicesSearch(servicesList) {
    const searchText = servicesList.dataset.search || 'Search...';
    const noMatchesText = servicesList.dataset.noMatches || 'No matches';

    const box = document.createElement('div');
    box.className = 'services-search';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'services-search-input';
    search.placeholder = searchText;
    search.setAttribute('aria-label', searchText);
    search.autocomplete = 'off';

    const empty = document.createElement('div');
    empty.className = 'services-search-empty';
    empty.textContent = noMatchesText;
    empty.hidden = true;

    box.appendChild(search);
    servicesList.prepend(box);
    servicesList.appendChild(empty);

    // what a service matches on: its name and the names of its prices
    // (data-children holds "id_sp_name" entries joined by "_sppr_")
    function searchTextOf(row) {
        const prices = (row.dataset.children || '').split('_sppr_').map(child => child.split('_sp_')[1] || '');
        return [row.dataset.parent || ''].concat(prices).join(' ').toLowerCase();
    }

    function filter() {
        const query = search.value.trim().toLowerCase();
        const rows = servicesList.querySelectorAll('.option[id^="parent_"]');
        let shown = 0;
        rows.forEach(row => {
            row.hidden = query !== '' && !searchTextOf(row).includes(query);
            if (!row.hidden) {
                shown++;
            }
        });
        // "Select all" would also tick services the search is hiding
        const selectAll = servicesList.querySelector('#select-all');
        if (selectAll) {
            selectAll.hidden = query !== '';
        }
        empty.hidden = rows.length === 0 || shown > 0;
    }

    search.addEventListener('input', filter);
    // Enter would submit the form
    search.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
        }
    });

    // start from the full list each time the list is opened again
    new MutationObserver(() => {
        if (servicesList.classList.contains('hidden') && search.value) {
            search.value = '';
            filter();
        }
    }).observe(servicesList, { attributes: true, attributeFilter: ['class'] });
}
