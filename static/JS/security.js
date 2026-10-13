// Loaded first on every page (with the CSP nonce).
//
// 1. escapeHtml() / safeMessage(): use them for any server data that is placed
//    into innerHTML or an HTML template string.
// 2. Declarative event handlers. The Content-Security-Policy blocks inline
//    handlers such as onclick="...", so elements use JSON attributes instead:
//
//      <i data-onclick='["sortTable", "$this", 0, "up"]'></i>
//      <img data-onclick='[["showImage", 2], ["changeType", 0, "$this"]]'>
//      <select data-onchange='["navigate", "/setlang?lang=", "$value"]'>
//
//    The value is one call ["functionName", arg, ...] or a list of calls.
//    Arguments are plain JSON values; "$this" is the element, "$value" its value.
//    Only functions listed in ALLOWED_ACTIONS can be called, so injected markup
//    cannot use these attributes to reach arbitrary globals such as fetch().
(function () {
    'use strict';

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Server answers are plain text, except that some use <br> for line breaks.
    function safeMessage(value) {
        return escapeHtml(value).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    }

    // Global page functions that markup may call through data-on* attributes
    const ALLOWED_ACTIONS = new Set([
        'sortTable',
        'toggleSidebar',
        'saveChanges',
        'changeStatus',
        'getProductTypes',
        'filter_products_by_title',
        'moveSlide',
        'handlePlusClick',
        'handleRemoveClick',
        'validateNumericInput',
        'showImage',
        'changeType',
        'prevImage',
        'nextImage',
        'scrollThumbnails',
        'scrollThumbnailsPrice',
        'scrollThumbnailsFromPrice'
    ]);

    const HELPERS = {
        // Replaces onchange="location = '/setlang?lang=' + this.value"
        navigate: function (path, value) {
            // Same-site paths only: "/x" but not "//other-site.com"
            if (typeof path !== 'string' || path.charAt(0) !== '/' || path.charAt(1) === '/') {
                return;
            }
            window.location.href = path + encodeURIComponent(value);
        }
    };

    function resolveArgument(arg, element) {
        if (arg === '$this') {
            return element;
        }
        if (arg === '$value') {
            return element.value;
        }
        return arg;
    }

    function runActions(element, spec) {
        let calls;
        try {
            calls = JSON.parse(spec);
        } catch (e) {
            console.error('Invalid action attribute:', spec);
            return;
        }
        if (!Array.isArray(calls) || calls.length === 0) {
            return;
        }
        if (!Array.isArray(calls[0])) {
            calls = [calls];
        }

        calls.forEach(function (call) {
            const name = call[0];
            let fn = null;
            if (Object.prototype.hasOwnProperty.call(HELPERS, name)) {
                fn = HELPERS[name];
            } else if (ALLOWED_ACTIONS.has(name)) {
                fn = window[name];
            }

            if (typeof fn !== 'function') {
                console.error('Action is not allowed or not defined on this page:', name);
                return;
            }

            const args = call.slice(1).map(function (arg) {
                return resolveArgument(arg, element);
            });
            fn.apply(element, args);
        });
    }

    // Capture phase on document: runs even if an inner element stops propagation,
    // and works for elements added later through innerHTML.
    ['click', 'change', 'input', 'keyup'].forEach(function (type) {
        const attribute = 'data-on' + type;
        document.addEventListener(type, function (event) {
            const target = event.target;
            if (!target || !target.closest) {
                return;
            }
            const element = target.closest('[' + attribute + ']');
            if (element) {
                runActions(element, element.getAttribute(attribute));
            }
        }, true);
    });

    window.escapeHtml = escapeHtml;
    window.safeMessage = safeMessage;
})();
