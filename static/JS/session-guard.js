// Loaded right after security.js on every page (templates/_session_guard.html).
//
// Keeps a page usable when its session ran out while it stayed open. Every request the
// page sends to this site (XMLHttpRequest or fetch) goes through here, so the pages
// themselves need no changes. The server marks the cases below with an X-Session-Error
// header (app.py handle_csrf_error, sysadmin.py login_required):
//
//   csrf  - the form token is no longer valid (400). The answer carries a fresh token:
//           the request is sent again once with it, unnoticed by the user.
//   login - staff were signed out for inactivity (401). A dialog asks them to sign in
//           (in another tab, so nothing typed on this page is lost); then the request
//           is sent again.
//   user  - another staff member is signed in now (409). The request is NOT repeated
//           as them; the dialog offers to reload the page.
//
// Requests are only ever repeated after the server refused them before doing anything,
// so nothing can happen twice. Other errors reach the page unchanged.
(function () {
    'use strict';

    let config = {};
    try {
        config = JSON.parse(document.getElementById('sessionGuardConfig').textContent) || {};
    } catch (e) { /* no config: defaults below */ }
    const TEXT = config.text || {};
    const STAFF_USER = config.user === null || config.user === undefined ? '' : String(config.user);
    const LOGIN_URL = config.loginUrl || '/login';
    const SIGN_IN_WINDOW = 'araxiSignIn';          // login.html closes itself when opened under this name
    const SIGNED_IN_KEY = 'araxiSignedIn';         // login.html sets it after a successful sign-in

    // A fresh CSRF token learned from a 'csrf' answer; used in place of the page's own
    let latestToken = null;

    function sameOrigin(url) {
        try {
            return new URL(url, location.href).origin === location.origin;
        } catch (e) {
            return false;
        }
    }

    function isTokenHeader(name) {
        return String(name).toLowerCase() === 'x-csrftoken';
    }

    function errorKind(status, header) {
        if ((status === 400 && header === 'csrf') || (status === 401 && header === 'login') || (status === 409 && header === 'user')) {
            return header;
        }
        return '';
    }

    function readJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function learnToken(answer) {
        if (answer && typeof answer.newCSRFtoken === 'string' && answer.newCSRFtoken) {
            latestToken = answer.newCSRFtoken;
        }
    }

    // ---------------------------------------------------------------- dialogs

    function addStyles() {
        if (document.getElementById('sessionGuardStyles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'sessionGuardStyles';
        style.textContent = `
.sg-dialog { box-sizing: border-box; width: min(calc(100% - 32px), 440px); max-height: calc(100% - 32px); margin: auto; padding: 28px;
  color: var(--navy-900, #072339); font-family: var(--font-body, system-ui, sans-serif); text-align: left; background: #fff;
  border: 0; border-radius: 20px; box-shadow: 0 30px 80px -20px rgba(4, 24, 42, .45); }
.sg-dialog::backdrop { background: rgba(4, 24, 42, .45); }
.sg-dialog h2 { margin: 0 0 12px; font: 400 1.5rem/1.2 var(--font-display, Georgia, serif); color: var(--navy-900, #072339); text-align: left; }
.sg-dialog p { margin: 0 0 10px; font-size: 15px; line-height: 1.5; color: var(--ink-600, #4a5b69); text-align: left; }
.sg-dialog .sg-note { min-height: 1.5em; margin: 0; color: var(--ochre-600, #a9733a); font-weight: 600; }
.sg-dialog .sg-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.sg-dialog .sg-btn { display: inline-flex; flex: 1 1 auto; align-items: center; justify-content: center; min-height: 44px; margin: 0;
  padding: 10px 18px; font: 600 15px/1.2 var(--font-body, system-ui, sans-serif); text-decoration: none; cursor: pointer;
  color: var(--navy-800, #0a3150); background: transparent; border: 1.5px solid currentColor; border-radius: 999px; }
.sg-dialog .sg-btn:hover { background: var(--cream-100, #f8f5ed); }
.sg-dialog .sg-btn--primary { color: #fff; background: var(--navy-800, #0a3150); border-color: var(--navy-800, #0a3150); }
.sg-dialog .sg-btn--primary:hover { background: var(--navy-700, #0c4464); }
.sg-dialog .sg-btn:focus-visible { outline: 3px solid var(--river-400, #4596b2); outline-offset: 2px; }`;
        document.head.appendChild(style);
    }

    function whenBodyReady() {
        if (document.body) {
            return Promise.resolve();
        }
        return new Promise(function (resolve) {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    function button(label, className) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'sg-btn' + (className ? ' ' + className : '');
        element.textContent = label;
        return element;
    }

    function makeDialog(id, title, text) {
        addStyles();
        const dialog = document.createElement('dialog');
        dialog.className = 'sg-dialog';
        dialog.id = id;
        dialog.setAttribute('aria-labelledby', id + 'Title');
        const heading = document.createElement('h2');
        heading.id = id + 'Title';
        heading.textContent = title;
        const body = document.createElement('p');
        body.textContent = text;
        const note = document.createElement('p');
        note.className = 'sg-note';
        note.setAttribute('aria-live', 'polite');
        const actions = document.createElement('div');
        actions.className = 'sg-actions';
        dialog.append(heading, body, note, actions);
        document.body.appendChild(dialog);
        return { dialog: dialog, note: note, actions: actions };
    }

    // One "signed out" dialog shared by every request waiting for a sign-in.
    // Resolves true (sign-in done: send again) or false (cancelled).
    let signInWait = null;
    let signInParts = null;

    function askToSignIn(stillSignedOut) {
        if (signInWait) {
            return signInWait;
        }
        signInWait = whenBodyReady().then(function () {
            return new Promise(function (resolve) {
                if (!signInParts) {
                    signInParts = makeDialog('sessionGuardSignIn', TEXT.signedOutTitle || 'You were signed out',
                        TEXT.signedOutText || 'Sign in again in a new tab, then come back and press Continue.');
                }
                const parts = signInParts;
                parts.note.textContent = stillSignedOut ? (TEXT.stillSignedOut || '') : '';
                parts.actions.replaceChildren();

                const cancel = button(TEXT.cancel || 'Cancel');
                // A link (not window.open) so pop-up blockers never stop it; the name lets
                // login.html close the tab after signing in and bring the user back here
                const signIn = document.createElement('a');
                signIn.className = 'sg-btn';
                signIn.href = LOGIN_URL;
                signIn.target = SIGN_IN_WINDOW;
                signIn.textContent = TEXT.signIn || 'Sign in';
                const proceed = button(TEXT.continue || 'Continue', 'sg-btn--primary');
                parts.actions.append(cancel, signIn, proceed);

                function finish(result) {
                    window.removeEventListener('storage', onStorage);
                    parts.dialog.removeEventListener('cancel', onCancel);
                    if (parts.dialog.open) {
                        parts.dialog.close();
                    }
                    signInWait = null;
                    resolve(result);
                }
                function onStorage(event) {
                    if (event.key === SIGNED_IN_KEY) {
                        finish(true);
                    }
                }
                function onCancel(event) {
                    event.preventDefault();
                    finish(false);
                }
                cancel.addEventListener('click', function () { finish(false); });
                proceed.addEventListener('click', function () { finish(true); });
                window.addEventListener('storage', onStorage);
                parts.dialog.addEventListener('cancel', onCancel);   // Esc
                parts.dialog.showModal();
                signIn.focus();
            });
        });
        return signInWait;
    }

    let reloadShown = false;

    function offerReload(message) {
        if (reloadShown) {
            return;
        }
        reloadShown = true;
        whenBodyReady().then(function () {
            const parts = makeDialog('sessionGuardReload', TEXT.otherUserTitle || 'Another user is signed in',
                message || TEXT.otherUserText || '');
            const reload = button(TEXT.reload || 'Reload page', 'sg-btn--primary');
            reload.addEventListener('click', function () { location.reload(); });
            parts.actions.append(reload);
            // Nothing on this page can be saved any more: no way to dismiss it
            parts.dialog.addEventListener('cancel', function (event) { event.preventDefault(); });
            parts.dialog.showModal();
            reload.focus();
        });
    }

    // Shared recovery steps. `send()` resends the request and returns its answer
    // as { kind, json, ... }; `answer` is the first answer received.
    async function recover(answer, send) {
        let tokenRetried = false;
        let stillSignedOut = false;
        while (answer.kind) {
            if (answer.kind === 'csrf') {
                if (tokenRetried) {
                    break;                      // refused twice: let the page show the message
                }
                tokenRetried = true;
                learnToken(answer.json);
                answer = await send();
            } else if (answer.kind === 'login') {
                const signedIn = await askToSignIn(stillSignedOut);
                if (!signedIn) {
                    break;
                }
                stillSignedOut = true;          // if this answer is 'login' again
                tokenRetried = false;           // signing in starts a new session and token
                answer = await send();
            } else {                            // 'user'
                offerReload(answer.json && answer.json.answer);
                break;
            }
        }
        return answer;
    }

    // ---------------------------------------------------------------- inactivity warning
    //
    // Staff are signed out after a period without server requests (15 minutes, or 8 hours
    // with "Remember me"). A minute before that, ask whether they are still there. Only a
    // click on "Stay signed in" extends the session (typing alone does not), so the
    // inactivity limit keeps its meaning. Every staff answer carries X-Session-Expires-In;
    // the deadline is shared between tabs, so working in one tab doesn't warn in another.

    const DEADLINE_KEY = 'araxiSessionDeadline';
    const WARN_SECONDS = 60;
    let deadline = null;            // ms timestamp when the session ends
    let warning = null;             // dialog parts while the warning is shown

    function shareDeadline() {
        try {
            localStorage.setItem(DEADLINE_KEY, STAFF_USER + ':' + deadline);
        } catch (e) { /* storage blocked: each tab keeps its own deadline */ }
    }

    function moveDeadline(ms, share) {
        if (!STAFF_USER || !ms || (deadline && ms <= deadline)) {
            return;
        }
        deadline = ms;
        if (share) {
            shareDeadline();
        }
        if (warning && secondsLeft() > WARN_SECONDS) {
            closeWarning();
        }
    }

    function noteExpiresIn(value) {
        const seconds = parseInt(value, 10);
        if (seconds > 0) {
            moveDeadline(Date.now() + seconds * 1000, true);
        }
    }

    function secondsLeft() {
        return deadline ? Math.ceil((deadline - Date.now()) / 1000) : Infinity;
    }

    function clock(seconds) {
        const s = Math.max(0, seconds);
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    function closeWarning() {
        if (warning) {
            if (warning.dialog.open) {
                warning.dialog.close();
            }
            warning.dialog.remove();
            warning = null;
        }
    }

    function showWarning() {
        if (warning || signInWait || !document.body) {
            return;
        }
        warning = makeDialog('sessionGuardWarning', TEXT.stillThereTitle || 'Are you still there?', '');
        const parts = warning;
        const text = parts.dialog.querySelector('p');
        parts.update = function () {
            text.textContent = (TEXT.stillThereText || 'You will be signed out in {time}.').replace('{time}', clock(secondsLeft()));
        };
        parts.update();
        const stay = button(TEXT.staySignedIn || 'Stay signed in', 'sg-btn--primary');
        stay.addEventListener('click', function () {
            stay.disabled = true;
            // The answer's X-Session-Expires-In moves the deadline and closes this dialog;
            // a refused token is renewed and a sign-out handled by the recovery above
            fetch(config.keepAliveUrl || '/session/keep-alive', { method: 'POST' })
                .catch(function () { /* offline: the warning stays */ })
                .finally(function () { stay.disabled = false; });
        });
        parts.actions.append(stay);
        parts.dialog.addEventListener('cancel', function (event) { event.preventDefault(); });
        parts.dialog.showModal();
        stay.focus();
    }

    if (STAFF_USER && typeof config.secondsLeft === 'number' && config.secondsLeft > 0) {
        let shared = null;
        try { shared = localStorage.getItem(DEADLINE_KEY); } catch (e) { /* blocked */ }
        moveDeadline(Date.now() + config.secondsLeft * 1000, true);
        if (shared && shared.indexOf(STAFF_USER + ':') === 0) {
            moveDeadline(parseInt(shared.slice(STAFF_USER.length + 1), 10), false);
        }
        window.addEventListener('storage', function (event) {
            if (event.key === DEADLINE_KEY && event.newValue && event.newValue.indexOf(STAFF_USER + ':') === 0) {
                moveDeadline(parseInt(event.newValue.slice(STAFF_USER.length + 1), 10), false);
            }
        });
        setInterval(function () {
            const left = secondsLeft();
            if (left > WARN_SECONDS) {
                closeWarning();
            } else if (left > 0) {
                showWarning();
                if (warning) {
                    warning.update();
                }
            } else {
                // Signed out now: the next action opens the "You were signed out" dialog
                closeWarning();
            }
        }, 1000);
    }

    // ---------------------------------------------------------------- XMLHttpRequest

    const NativeXHR = window.XMLHttpRequest;

    if (NativeXHR) {
        const snapshot = function (xhr) {
            let text = null;
            let xml = null;
            try { text = xhr.responseText; } catch (e) { /* responseType is not text */ }
            try { xml = xhr.responseXML; } catch (e) { /* not a document */ }
            noteExpiresIn(xhr.getResponseHeader('X-Session-Expires-In'));
            return {
                kind: errorKind(xhr.status, xhr.getResponseHeader('X-Session-Error')),
                json: text === null ? null : readJson(text),
                status: xhr.status,
                statusText: xhr.statusText,
                responseText: text,
                response: xhr.response,
                responseXML: xml,
                responseURL: xhr.responseURL,
                headers: xhr.getAllResponseHeaders()
            };
        };

        const resend = function (xhr) {
            const sg = xhr._sg;
            return new Promise(function (resolve) {
                const request = new NativeXHR();
                request.open(sg.method, sg.url, true);
                let hasToken = false;
                sg.headers.forEach(function (header) {
                    let value = header[1];
                    if (isTokenHeader(header[0])) {
                        hasToken = true;
                        value = latestToken || value;
                    }
                    request.setRequestHeader(header[0], value);
                });
                if (!hasToken && latestToken) {
                    request.setRequestHeader('X-CSRFToken', latestToken);
                }
                request.withCredentials = xhr.withCredentials;
                request.responseType = xhr.responseType;
                request.timeout = xhr.timeout;
                request.addEventListener('loadend', function () { resolve(snapshot(request)); });
                request.send(sg.body);
            });
        };

        // Hands the final answer to the page's own handlers, as if it were the first one
        const deliver = function (xhr, answer, replaced) {
            if (replaced) {
                ['status', 'statusText', 'responseText', 'response', 'responseXML', 'responseURL'].forEach(function (name) {
                    Object.defineProperty(xhr, name, { value: answer[name], configurable: true });
                });
                const headers = {};
                String(answer.headers || '').trim().split(/[\r\n]+/).forEach(function (line) {
                    const at = line.indexOf(':');
                    if (at > 0) {
                        headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
                    }
                });
                Object.defineProperty(xhr, 'getResponseHeader', {
                    value: function (name) {
                        const value = headers[String(name).toLowerCase()];
                        return value === undefined ? null : value;
                    },
                    configurable: true
                });
                Object.defineProperty(xhr, 'getAllResponseHeaders', { value: function () { return answer.headers; }, configurable: true });
            }
            xhr._sg.replaying = true;
            try {
                xhr.dispatchEvent(new Event('readystatechange'));
                xhr.dispatchEvent(new ProgressEvent(answer.status === 0 ? 'error' : 'load'));
                xhr.dispatchEvent(new ProgressEvent('loadend'));
            } finally {
                xhr._sg.replaying = false;
                xhr._sg.held = false;
            }
        };

        class GuardedXHR extends NativeXHR {
            constructor() {
                super();
                this._sg = { headers: [], held: false, replaying: false, guarded: false };
                // Registered here, before any page handler, so a refused answer can be held
                // back until it is recovered
                this.addEventListener('readystatechange', (event) => {
                    const sg = this._sg;
                    if (sg.replaying || !sg.guarded || this.readyState !== 4) {
                        return;
                    }
                    const first = snapshot(this);
                    if (!first.kind) {
                        return;
                    }
                    sg.held = true;
                    event.stopImmediatePropagation();
                    // After this task, so the held load / loadend events have passed
                    setTimeout(async () => {
                        const final = await recover(first, () => resend(this));
                        deliver(this, final, final !== first);
                    });
                });
                const hold = (event) => {
                    if (this._sg.held && !this._sg.replaying) {
                        event.stopImmediatePropagation();
                    }
                };
                this.addEventListener('load', hold);
                this.addEventListener('loadend', hold);
            }

            open(method, url, async) {
                this._sg = {
                    headers: [], held: false, replaying: false, guarded: false,
                    method: method, url: String(url),
                    async: arguments.length < 3 || async !== false
                };
                return super.open(...arguments);
            }

            setRequestHeader(name, value) {
                if (isTokenHeader(name) && latestToken) {
                    value = latestToken;
                }
                this._sg.headers.push([name, value]);
                return super.setRequestHeader(name, value);
            }

            send(body) {
                const sg = this._sg;
                sg.guarded = sg.async && sameOrigin(sg.url);
                sg.body = body;
                if (sg.guarded) {
                    const names = sg.headers.map(function (header) { return String(header[0]).toLowerCase(); });
                    if (names.indexOf('x-requested-with') === -1) {
                        this.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                    }
                    if (STAFF_USER && names.indexOf('x-staff-user') === -1) {
                        this.setRequestHeader('X-Staff-User', STAFF_USER);
                    }
                }
                return super.send(body);
            }
        }

        window.XMLHttpRequest = GuardedXHR;
    }

    // ---------------------------------------------------------------- fetch

    const nativeFetch = window.fetch ? window.fetch.bind(window) : null;

    if (nativeFetch) {
        window.fetch = async function (input, init) {
            const url = input instanceof Request ? input.url : String(input);
            if (!sameOrigin(url)) {
                return nativeFetch(input, init);
            }
            const original = new Request(input, init);
            const send = function () {
                const copy = original.clone();          // the body can only be read once
                const headers = new Headers(copy.headers);
                if (!headers.has('X-Requested-With')) {
                    headers.set('X-Requested-With', 'XMLHttpRequest');
                }
                if (STAFF_USER && !headers.has('X-Staff-User')) {
                    headers.set('X-Staff-User', STAFF_USER);
                }
                if (latestToken) {
                    headers.set('X-CSRFToken', latestToken);
                }
                return nativeFetch(new Request(copy, { headers: headers }));
            };
            const read = async function (response) {
                noteExpiresIn(response.headers.get('X-Session-Expires-In'));
                const kind = errorKind(response.status, response.headers.get('X-Session-Error'));
                let json = null;
                if (kind) {
                    try { json = await response.clone().json(); } catch (e) { /* not JSON */ }
                }
                return { kind: kind, json: json, response: response };
            };
            const final = await recover(await read(await send()), async function () {
                return read(await send());
            });
            return final.response;
        };
    }
})();
