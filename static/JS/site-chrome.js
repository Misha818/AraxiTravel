/*
 * Site header behaviour (templates/_site_header.html), used by the landing page and the client
 * product page: solid look once the page is scrolled, the mobile menu, and highlighting of the
 * landing-page section in view. Language links are rendered by the template (_lang_switch.html).
 */
(function () {
    'use strict';

    const header = document.querySelector('[data-header]');
    const toggle = document.querySelector('[data-menu-toggle]');
    const label = document.querySelector('[data-menu-label]');
    const nav = document.querySelector('[data-nav]');
    if (!header || !toggle || !nav) return;

    const onScroll = function () { header.classList.toggle('is-solid', window.scrollY > 40); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    function setMenu(open) {
        document.documentElement.classList.toggle('menu-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (label) label.textContent = open ? toggle.dataset.labelClose : toggle.dataset.labelOpen;
    }
    toggle.addEventListener('click', function () {
        setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
            setMenu(false);
            toggle.focus();
        }
    });
    window.matchMedia('(min-width: 900px)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });

    // Landing page: highlight the link of the section in view.
    const links = Array.from(document.querySelectorAll('[data-nav-link]'));
    const sections = document.querySelectorAll('main section[id]');
    if (sections.length && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                links.forEach(function (link) {
                    const active = link.getAttribute('href') === '#' + entry.target.id;
                    link.classList.toggle('is-active', active);
                    if (active) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
                });
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        sections.forEach(function (section) { observer.observe(section); });
    }
})();
