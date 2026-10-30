document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    const GA_ID = 'G-S5ZJW576QK';
    const LOCATE_ZOOM = 15;

    const SUPPORT = {
        MIN_VISIT_DAYS: 2,
        MIN_ACTIONS: 5,
        DELAY_MS: 6000,
        COOLDOWN_SHOWN_DAYS: 30,
        COOLDOWN_DISMISSED_DAYS: 60,
        COOLDOWN_DONATED_DAYS: 180
    };    const el = id => document.getElementById(id);
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobileLayout = () => window.matchMedia('(max-width: 899px) and (min-height: 480px), (max-width: 799px), (max-height: 479px)').matches;

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    const today = new Date();
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));
    const dateParam = params.get('date');

    const mapOptions = {
        minZoom: 4,
        maxZoom: 18,
        center: [51.505, -0.09],
        zoom: 5,
        zoomControl: false,
        attributionControl: false
    };

    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        mapOptions.center = [lat, lng];
    }

    const map = L.map('map', mapOptions);

    const IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
    const TILE_LOADING = { keepBuffer: 4, updateWhenIdle: false, updateWhenZooming: false };

    L.tileLayer(IMAGERY_URL, {
        attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS User Community',
        maxZoom: 18,
        ...TILE_LOADING
    }).addTo(map);

    map.createPane('labels');
    map.getPane('labels').style.zIndex = 250;
    map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer(LABELS_URL, {
        pane: 'labels',
        maxZoom: 18,
        ...TILE_LOADING
    }).addTo(map);

    map.whenReady(() => {
        const conn = navigator.connection;
        if (conn && conn.saveData) return;
        const preload = () => {
            const z0 = Math.round(map.getZoom());
            const c = map.getCenter();
            [[z0 - 1, 1], [z0 + 1, 2]].forEach(([z, span]) => {
                if (z < map.getMinZoom() || z > map.getMaxZoom()) return;
                const p = map.project(c, z).divideBy(256);
                const n = Math.pow(2, z);
                const first = span === 1 ? Math.floor(p.x) : Math.round(p.x) - 1;
                const firstY = span === 1 ? Math.floor(p.y) : Math.round(p.y) - 1;
                for (let dx = 0; dx < span; dx++) {
                    for (let dy = 0; dy < span; dy++) {
                        const y = firstY + dy;
                        if (y < 0 || y >= n) continue;
                        const x = ((first + dx) % n + n) % n;
                        [IMAGERY_URL, LABELS_URL].forEach(url => { new Image().src = L.Util.template(url, { z, y, x }); });
                    }
                }
            });
        };
        if (window.requestIdleCallback) requestIdleCallback(preload, { timeout: 4000 }); else setTimeout(preload, 1500);
    });

    const toast = el('toast');
    let toastTimer = null;
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
    }

    const liveRegion = el('liveRegion');
    let liveTimer = null;
    function announce(message) {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(() => { liveRegion.textContent = message; }, 600);
    }

    const dock = el('dock');
    const refs = {
        amFrom: el('amFrom'), amTo: el('amTo'), pmFrom: el('pmFrom'), pmTo: el('pmTo'),
        sunriseTime: el('sunriseTime'), sunsetTime: el('sunsetTime'),
        sunriseDir: el('sunriseDir'), sunsetDir: el('sunsetDir'),
        miniAm: el('miniAm'), miniPm: el('miniPm'), nowAm: el('nowAm'), nowPm: el('nowPm'),
        windows: el('windows'), notice: el('notice'),
        noticeTitle: el('noticeTitle'), noticeText: el('noticeText'), noticeIcon: el('noticeIcon')
    };
    let lastSignature = '';
    let sunInfo = null;

    function updateDockHeight() {
        const h = Math.max(0, window.innerHeight - dock.getBoundingClientRect().top);
        document.documentElement.style.setProperty('--dock-h', Math.round(h) + 'px');
    }
    if ('ResizeObserver' in window) new ResizeObserver(() => updateDockHeight()).observe(dock);
    window.addEventListener('resize', updateDockHeight);
    updateDockHeight();

    let shareUsed = false;
    function shareSpot() {
        const center = map.getCenter().wrap();
        const pad = n => String(n).padStart(2, '0');
        const dateStr = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
        const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${+center.lat.toFixed(6)}&lng=${+center.lng.toFixed(6)}&date=${dateStr}`;
        copyToClipboard(shareUrl);
        showToast('Link copied to clipboard');
        shareUsed = true;
        hideShareHint();
    }
    el('shareBtn').addEventListener('click', shareSpot);
    el('shareFab').addEventListener('click', shareSpot);

    function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            return;
        }
        fallbackCopy(text);
    }

    function fallbackCopy(text) {
        const tempInput = document.createElement('input');
        document.body.appendChild(tempInput);
        tempInput.value = text;
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
    }

    const CONSENT_KEY = 'ghm-consent-v2';
    const CONSENT_MONTHS = 12;
    const GA_CONFIG = { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_flags: 'SameSite=Lax;Secure' };
    const browserSignal = (() => {
        try { return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1'; }
        catch (e) { return false; }
    })();
    let consent = null;
    let analyticsStarted = false;

    function readConsent() {
        try {
            const o = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
            if (!o || (o.c !== 'granted' && o.c !== 'denied')) return null;
            const t = Date.parse(o.d);
            if (!isFinite(t)) return null;
            const exp = new Date(t); exp.setMonth(exp.getMonth() + CONSENT_MONTHS);
            return Date.now() > exp.getTime() ? null : o.c;
        } catch (e) { return null; }
    }
    function writeConsent(choice) {
        try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ c: choice, d: new Date().toISOString() })); return true; }
        catch (e) { return false; }
    }
    function clearGaCookies() {
        try {
            const names = document.cookie.split(';').map(s => s.split('=')[0].trim()).filter(n => /^(_ga|_gid|_gat)/.test(n));
            if (!names.length) return;
            const parts = location.hostname.split('.');
            const scopes = [''];
            for (let i = 0; i < parts.length - 1; i++) scopes.push('; domain=.' + parts.slice(i).join('.'));
            scopes.push('; domain=' + location.hostname);
            names.forEach(n => scopes.forEach(sc => { document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + sc; }));
        } catch (e) { }
    }
    function gtag() { window.dataLayer.push(arguments); }
    function loadGoogleAnalytics(id) {
        if (consent !== 'granted' || browserSignal) return;
        window['ga-disable-' + id] = false;
        if (analyticsStarted) { gtag('config', id, GA_CONFIG); return; }
        analyticsStarted = true;
        window.dataLayer = window.dataLayer || [];
        gtag('js', new Date());
        gtag('config', id, GA_CONFIG);
        const script = document.createElement('script');
        script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        script.async = true;
        document.head.appendChild(script);
    }
    function stopAnalytics() {
        window['ga-disable-' + GA_ID] = true;
        clearGaCookies();
    }
    function setConsent(choice) {
        if (browserSignal) choice = 'denied';
        let ok = true;
        if (choice === 'granted') { ok = writeConsent('granted'); if (!ok) choice = 'denied'; }
        else if (!browserSignal) writeConsent('denied');
        consent = choice;
        if (choice === 'granted') loadGoogleAnalytics(GA_ID); else stopAnalytics();
        refreshConsentUI();
        return ok;
    }
    consent = browserSignal ? 'denied' : readConsent();
    if (consent === 'granted') loadGoogleAnalytics(GA_ID); else if (browserSignal) stopAnalytics();

    const SIGNAL_TEXT = 'Your browser is sending a Do Not Track or Global Privacy Control signal, so analytics is off.';
    const consentBanner = el('consentBanner');
    let consentTimer = null;
    const consentNeeded = () => !browserSignal && consent === null;
    function showConsentBanner() {
        clearTimeout(consentTimer);
        if (!consentNeeded() || !consentBanner.hidden) return;
        consentBanner.hidden = false;
        requestAnimationFrame(() => consentBanner.classList.add('show'));
        announce('We use Google Analytics to understand how the site is used. Accept or decline, your choice.');
    }
    function hideConsentBanner() {
        clearTimeout(consentTimer);
        if (consentBanner.hidden) return;
        const hadFocus = consentBanner.contains(document.activeElement);
        consentBanner.classList.remove('show');
        setTimeout(() => { consentBanner.hidden = true; }, reducedMotion() ? 0 : 350);
        if (hadFocus) el('toolsBtn').focus({ preventScroll: true });
    }
    function consentWelcomeClosed() {
        clearTimeout(consentTimer);
        if (tourQueued || tourOpen) return;
        if (consentNeeded()) consentTimer = setTimeout(showConsentBanner, 600);
    }

    function refreshConsentUI() {
        if (!consentNeeded()) hideConsentBanner();
        el('prvStatus').textContent = browserSignal ? SIGNAL_TEXT
            : consent === 'granted' ? 'Analytics cookies are on. Thank you, this helps improve the site.'
            : consent === 'denied' ? 'Analytics cookies are off.'
            : 'You haven\u2019t chosen yet. Nothing is collected unless you accept.';
        el('prvAllow').setAttribute('aria-pressed', String(consent === 'granted'));
        el('prvDeny').setAttribute('aria-pressed', String(consent === 'denied'));
        el('prvAllow').disabled = browserSignal;
    }
    const welcome = el('welcome');
    const appRoot = el('app');
    let tourQueued = false, tourOpen = false;
    let welcomeOpener = null;

    const welcomeVideo = el('welcomeVideo');
    const welcomeVideoAllowed = !(reducedMotion() || (navigator.connection && navigator.connection.saveData));
    if (welcomeVideoAllowed) {
        const showWelcomeVideo = () => welcomeVideo.classList.remove('is-loading');
        if (welcomeVideo.readyState < 2) {
            welcomeVideo.classList.add('is-loading');
            ['loadeddata', 'canplay', 'playing', 'error'].forEach(ev => welcomeVideo.addEventListener(ev, showWelcomeVideo, { once: true }));
            setTimeout(showWelcomeVideo, 6000);
        }
    } else {
        welcomeVideo.pause();
        welcomeVideo.removeAttribute('src');
        welcomeVideo.load();
        welcomeVideo.parentElement.classList.add('no-video');
    }

    function openWelcome(opener) {
        welcomeOpener = opener || null;
        welcome.hidden = false;
        appRoot.setAttribute('inert', '');
        el('toast').setAttribute('inert', '');
        requestAnimationFrame(() => welcome.classList.add('open'));
        if (welcomeVideoAllowed) { const pr = welcomeVideo.play(); if (pr && pr.catch) pr.catch(() => {}); }
        refreshConsentUI();
        focusWelcome();
    }
    function focusWelcome() { welcome.focus({ preventScroll: true }); }

    function closeWelcome() {
        welcome.classList.remove('open');
        appRoot.removeAttribute('inert');
        el('toast').removeAttribute('inert');
        setTimeout(() => { welcome.hidden = true; welcomeVideo.pause(); }, reducedMotion() ? 0 : 320);
        if (welcomeOpener && welcomeOpener.focus) welcomeOpener.focus({ preventScroll: true });
        maybeStartTour();
        supportWelcomeClosed();
        consentWelcomeClosed();
    }

    appRoot.setAttribute('inert', '');
    refreshConsentUI();
    focusWelcome();

    el('startButton').addEventListener('click', () => closeWelcome());
    el('startButton').addEventListener('click', e => {
        if (reducedMotion()) return;
        const btn = e.currentTarget;
        const r = btn.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2.2;
        const ripple = document.createElement('span');
        ripple.className = 'welcome-ripple';
        ripple.setAttribute('aria-hidden', 'true');
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.detail === 0 ? r.width / 2 : e.clientX - r.left) + 'px';
        ripple.style.top = (e.detail === 0 ? r.height / 2 : e.clientY - r.top) + 'px';
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
    el('consentAccept').addEventListener('click', () => {
        if (setConsent('granted')) showToast('Analytics cookies are on'); else showToast('Your browser blocks storage, so analytics stays off.');
    });
    el('consentDecline').addEventListener('click', () => { setConsent('denied'); showToast('Analytics cookies are off'); });
    welcome.addEventListener('keydown', e => {
        if (e.key === 'Escape' && welcomeOpener) { closeWelcome(); return; }
        if (e.key === 'Tab') {
            const items = Array.from(welcome.querySelectorAll('button:not([hidden]), a[href], input, [tabindex="0"]'))
                .filter(n => n.offsetParent !== null);
            if (!items.length) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === welcome)) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });

    el('infoBtn').addEventListener('click', () => openWelcome(el('toolsBtn')));

    const TOUR_KEY = 'ghm-tour-done';
    const tourCard = el('tourCard');
    const tourRing = el('tourRing');
    const tourNext = el('tourNext');
    const tourBack = el('tourBack');
    const tourSkip = el('tourSkip');
    const tourDots = el('tourDots');
    const tourSteps = [
        { title: 'Pick a spot', text: 'Drag the map so the dot sits on your chosen location. The time will update live.',
          target: () => document.querySelector('.map-centre'), size: 22, radius: '50%', place: 'below' },
        { title: 'Search', text: 'Looking for somewhere specific? Search for a town, street or landmark and the map moves there.',
          target: () => el('searchToggle'), radius: '50%', place: 'below' },
        { title: 'Golden hour times', text: 'Tap Morning or Evening to pin a guide line on the map. Hover the white arrows to line the sun up with the view.',
          target: () => el('windows'), radius: '24px', place: 'above' },
        { title: 'Day and sun path', text: 'Change the day here, or open the arrow to see the sun path with sunrise and sunset.',
          target: () => document.querySelector('.dock-row'), radius: '24px', place: 'above' },
        { title: 'Location and menu', text: 'The top menu has more options, below that you can zoom to your current location, or share the selected day & location to plan your shoot.',
          target: () => el('tools'), radius: '24px', place: 'below' }
    ];
    let tourIdx = 0, tourTimer = null, tourPoll = null, tourReturn = null;

    function tourDone() {
        try { return localStorage.getItem(TOUR_KEY) === '1' || localStorage.getItem('ghm-hint-seen') === '1'; } catch (e) { return false; }
    }
    function tourRect(step) {
        const t = step.target();
        if (!t) return null;
        const r = t.getBoundingClientRect();
        if (step.size) { const h = step.size / 2; return { left: r.left - h, top: r.top - h, width: step.size, height: step.size, right: r.left + h, bottom: r.top + h }; }
        return r.width > 0 && r.height > 0 ? r : null;
    }
    function tourPlace(instant) {
        if (!tourOpen) return;
        const step = tourSteps[tourIdx];
        const M = 12, GAP = 14, PAD = 6;
        const vw = document.documentElement.clientWidth, vh = window.innerHeight;
        const cw = tourCard.offsetWidth, ch = tourCard.offsetHeight;
        const r = tourRect(step);
        let left, top;
        if (r) {
            const below = r.bottom + PAD + GAP + ch <= vh - M;
            const above = r.top - PAD - GAP - ch >= M;
            let useBelow = step.place === 'below';
            if (useBelow && !below && above) useBelow = false;
            else if (!useBelow && !above && below) useBelow = true;
            else if (!below && !above) useBelow = (vh - r.bottom) >= r.top;
            left = r.left + r.width / 2 - cw / 2;
            top = useBelow ? r.bottom + PAD + GAP : r.top - PAD - GAP - ch;
            tourRing.hidden = false;
            tourRing.style.left = Math.round(r.left - PAD) + 'px';
            tourRing.style.top = Math.round(r.top - PAD) + 'px';
            tourRing.style.width = Math.round(r.width + 2 * PAD) + 'px';
            tourRing.style.height = Math.round(r.height + 2 * PAD) + 'px';
            tourRing.style.borderRadius = step.radius;
        } else {
            tourRing.hidden = true;
            left = (vw - cw) / 2;
            top = vh - ch - 140;
        }
        left = Math.max(M, Math.min(left, vw - cw - M));
        top = Math.max(M, Math.min(top, vh - ch - M));
        if (instant) { tourCard.classList.add('is-placing'); tourRing.classList.add('is-placing'); }
        tourCard.style.left = Math.round(left) + 'px';
        tourCard.style.top = Math.round(top) + 'px';
        if (instant) {
            void tourCard.offsetWidth;
            tourCard.classList.remove('is-placing'); tourRing.classList.remove('is-placing');
        }
    }
    function tourShow(i, instant) {
        tourIdx = i;
        const step = tourSteps[i];
        const last = i === tourSteps.length - 1;
        el('tourCount').textContent = 'Step ' + (i + 1) + ' of ' + tourSteps.length + '.';
        el('tourTitle').textContent = step.title;
        el('tourText').textContent = step.text;
        Array.from(tourDots.children).forEach((d, n) => d.classList.toggle('on', n === i));
        tourBack.hidden = i === 0;
        tourSkip.hidden = last;
        tourNext.textContent = last ? 'Done' : 'Next';
        tourPlace(instant);
        tourNext.focus({ preventScroll: true });
    }
    function startTour() {
        clearTimeout(tourTimer);
        if (tourOpen) return;
        if (!welcome.hidden || menuIsOpen() || calOpen || !privacyPanel.hidden || appRoot.classList.contains('is-searching')) {
            tourQueued = false;
            consentWelcomeClosed();
            return;
        }
        tourQueued = false;
        tourOpen = true;
        tourReturn = document.activeElement;
        document.documentElement.classList.add('tour-open');
        tourDots.textContent = '';
        tourSteps.forEach(() => tourDots.appendChild(document.createElement('i')));
        tourCard.hidden = false;
        tourShow(0, true);
        requestAnimationFrame(() => { tourCard.classList.add('show'); tourRing.classList.add('show'); });
        clearInterval(tourPoll);
        tourPoll = setInterval(() => {
            if (appRoot.classList.contains('is-searching') || menuIsOpen() || calOpen || !welcome.hidden || !privacyPanel.hidden) { endTour(false); return; }
            tourPlace(false);
        }, 400);
    }
    function endTour(returnFocus) {
        if (!tourOpen) return;
        tourOpen = false;
        tourQueued = false;
        clearInterval(tourPoll);
        try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { }
        document.documentElement.classList.remove('tour-open');
        tourCard.classList.remove('show');
        tourRing.classList.remove('show');
        const hadFocus = tourCard.contains(document.activeElement);
        setTimeout(() => { if (!tourOpen) { tourCard.hidden = true; tourRing.hidden = true; } }, reducedMotion() ? 0 : 320);
        if ((returnFocus !== false || hadFocus) && tourReturn && tourReturn !== document.body && document.contains(tourReturn) && tourReturn.focus) tourReturn.focus({ preventScroll: true });
        tourReturn = null;
        consentWelcomeClosed();
    }
    function maybeStartTour() {
        if (tourDone() || tourOpen || tourQueued) return;
        tourQueued = true;
        clearTimeout(tourTimer);
        tourTimer = setTimeout(startTour, reducedMotion() ? 250 : 700);
    }
    tourNext.addEventListener('click', () => { if (tourIdx >= tourSteps.length - 1) endTour(true); else tourShow(tourIdx + 1, false); });
    tourBack.addEventListener('click', () => { if (tourIdx > 0) tourShow(tourIdx - 1, false); });
    tourSkip.addEventListener('click', () => endTour(true));
    document.addEventListener('keydown', e => {
        if (!tourOpen) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(true); return; }
        if (!tourCard.contains(document.activeElement)) return;
        if (e.key === 'Tab') {
            const btns = Array.from(tourCard.querySelectorAll('button')).filter(b => !b.hidden);
            const first = btns[0], lastBtn = btns[btns.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastBtn.focus(); }
            else if (!e.shiftKey && document.activeElement === lastBtn) { e.preventDefault(); first.focus(); }
        } else if (e.key === 'ArrowRight') { e.preventDefault(); tourNext.click(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); tourBack.click(); }
    }, true);
    window.addEventListener('resize', () => tourPlace(true));
    window.addEventListener('orientationchange', () => setTimeout(() => tourPlace(true), 250));
    el('tipsBtn').addEventListener('click', () => { clearTimeout(tourTimer); setTimeout(startTour, 80); });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('Service Worker registered with scope:', registration.scope))
            .catch(error => console.log('Service Worker registration failed:', error));
    }

    const calBtn = el('cal');
    const calEl = el('calendar');
    const calScrim = el('calScrim');
    const calGrid = el('calGrid');
    const calMonths = el('calMonths');
    const calTitle = el('calTitle');
    const calTitleText = el('calTitleText');
    const calPrev = el('calPrev');
    const calNext = el('calNext');

    const CAL_MIN_YEAR = 1900;
    const CAL_MAX_YEAR = 2100;
    const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DOW_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    let calOpen = false;
    let calMode = 'days';
    let calFocusDate = null;
    let calCloseTimer = null;

    el('prev-day').addEventListener('click', () => stepDay(-1));
    el('next-day').addEventListener('click', () => stepDay(1));

    function stepDay(offset) {
        date.setDate(date.getDate() + offset);
        updateDateLabel();
        if (calOpen) {
            calFocusDate = clampCalDate(calDay(date.getFullYear(), date.getMonth(), date.getDate()));
            renderCal(false);
        }
        changeSunArrows(refresh);
        supportAction();
    }

    const calDay = (y, m, d) => new Date(y, m, d, 12);
    const calDaysIn = (y, m) => new Date(y, m + 1, 0).getDate();
    const calInRange = d => d.getFullYear() >= CAL_MIN_YEAR && d.getFullYear() <= CAL_MAX_YEAR;
    const calSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const calLabel = d => `${FULL_DAYS[d.getDay()]} ${d.getDate()} ${FULL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;

    function clampCalDate(d) {
        if (d.getFullYear() < CAL_MIN_YEAR) return calDay(CAL_MIN_YEAR, 0, 1);
        if (d.getFullYear() > CAL_MAX_YEAR) return calDay(CAL_MAX_YEAR, 11, 31);
        return d;
    }
    function calAddMonths(d, n) {
        const first = calDay(d.getFullYear(), d.getMonth() + n, 1);
        const y = first.getFullYear();
        const m = first.getMonth();
        return clampCalDate(calDay(y, m, Math.min(d.getDate(), calDaysIn(y, m))));
    }

    function renderCal(focusActive) {
        const f = calFocusDate;
        const y = f.getFullYear();
        const m = f.getMonth();
        const days = calMode === 'days';
        calGrid.hidden = !days;
        calMonths.hidden = days;
        calTitle.setAttribute('aria-expanded', String(!days));
        calTitle.title = days ? 'Choose month and year' : 'Back to days';
        calTitleText.textContent = days ? `${FULL_MONTHS[m]} ${y}` : String(y);
        calPrev.setAttribute('aria-label', days ? 'Previous month' : 'Previous year');
        calNext.setAttribute('aria-label', days ? 'Next month' : 'Next year');
        calPrev.disabled = days ? (y === CAL_MIN_YEAR && m === 0) : y <= CAL_MIN_YEAR;
        calNext.disabled = days ? (y === CAL_MAX_YEAR && m === 11) : y >= CAL_MAX_YEAR;

        const ae = document.activeElement;
        const refocus = focusActive || (calEl.contains(ae) && (calGrid.contains(ae) || calMonths.contains(ae) || ae.disabled));

        if (days) {
            let html = '<div class="cal-row" role="row">' + DOW_SHORT.map((n, i) =>
                `<span class="cal-dow" role="columnheader" aria-label="${FULL_DAYS[(i + 1) % 7]}">${n}</span>`).join('') + '</div>';
            const lead = (calDay(y, m, 1).getDay() + 6) % 7;
            for (let w = 0; w < 6; w++) {
                html += '<div class="cal-row" role="row">';
                for (let i = 0; i < 7; i++) {
                    const d = calDay(y, m, 1 - lead + w * 7 + i);
                    const sel = calSameDay(d, date);
                    const tod = calSameDay(d, today);
                    const cls = 'cal-day' + (d.getMonth() !== m ? ' is-out' : '') + (sel ? ' is-sel' : '') + (tod ? ' is-today' : '');
                    html += `<button type="button" role="gridcell" class="${cls}" data-t="${d.getTime()}" tabindex="${calSameDay(d, f) ? 0 : -1}"`
                        + ` aria-selected="${sel}"${tod ? ' aria-current="date"' : ''}${calInRange(d) ? '' : ' disabled'} aria-label="${calLabel(d)}">${d.getDate()}</button>`;
                }
                html += '</div>';
            }
            calGrid.innerHTML = html;
        } else {
            let html = '';
            for (let k = 0; k < 12; k++) {
                const sel = date.getFullYear() === y && date.getMonth() === k;
                const tod = today.getFullYear() === y && today.getMonth() === k;
                html += `<button type="button" class="cal-month${sel ? ' is-sel' : ''}${tod ? ' is-today' : ''}" data-m="${k}" tabindex="${k === m ? 0 : -1}"`
                    + ` aria-pressed="${sel}"${tod ? ' aria-current="date"' : ''} aria-label="${FULL_MONTHS[k]} ${y}">${MONTH_NAMES[k]}</button>`;
            }
            calMonths.innerHTML = html;
        }
        if (refocus) {
            const target = (days ? calGrid : calMonths).querySelector('[tabindex="0"]');
            if (target) target.focus({ preventScroll: true });
        }
    }

    function setCalMode(mode, focusActive) {
        calMode = mode;
        renderCal(focusActive);
    }

    function placeCal() {
        const modal = isMobileLayout();
        calEl.classList.toggle('cal-modal', modal);
        if (modal) calEl.classList.remove('cal-above');
        calEl.setAttribute('aria-modal', String(modal));
        calScrim.hidden = !modal;
        if (modal) {
            calEl.style.left = '';
            calEl.style.top = '';
            return;
        }
        const pill = calBtn.parentElement.getBoundingClientRect();
        const w = calEl.offsetWidth;
        const h = calEl.offsetHeight;
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const left = Math.max(12, Math.min(pill.left + pill.width / 2 - w / 2, vw - w - 12));
        let top = pill.bottom + 8;
        let up = false;
        if (top + h > vh - 12) {
            const above = pill.top - 8 - h;
            up = above >= 12;
            top = up ? above : Math.max(12, vh - h - 12);
        }
        calEl.classList.toggle('cal-above', up);
        calEl.style.left = left + 'px';
        calEl.style.top = top + 'px';
    }

    function openCal() {
        if (calOpen) return;
        clearTimeout(calCloseTimer);
        calEl.classList.remove('is-closing');
        calScrim.classList.remove('is-closing');
        calOpen = true;
        calMode = 'days';
        calFocusDate = clampCalDate(calDay(date.getFullYear(), date.getMonth(), date.getDate()));
        calEl.hidden = false;
        placeCal();
        calBtn.setAttribute('aria-expanded', 'true');
        renderCal(true);
        placeCal();
    }

    function closeCal(returnFocus) {
        if (!calOpen) return;
        calOpen = false;
        calBtn.setAttribute('aria-expanded', 'false');
        clearTimeout(calCloseTimer);
        const finish = () => {
            calEl.hidden = true;
            calScrim.hidden = true;
            calEl.classList.remove('is-closing');
            calScrim.classList.remove('is-closing');
        };
        if (reducedMotion()) {
            finish();
        } else {
            calEl.classList.add('is-closing');
            calScrim.classList.add('is-closing');
            calCloseTimer = setTimeout(finish, 170);
        }
        if (returnFocus) calBtn.focus({ preventScroll: true });
    }

    function selectCalDate(d) {
        setSelectedDate(d.getFullYear(), d.getMonth(), d.getDate());
        changeSunArrows(refresh);
        closeCal(true);
        supportAction();
    }

    calBtn.addEventListener('click', () => { if (calOpen) closeCal(true); else openCal(); });
    el('calClose').addEventListener('click', () => closeCal(true));
    el('calToday').addEventListener('click', () => selectCalDate(calDay(today.getFullYear(), today.getMonth(), today.getDate())));
    calPrev.addEventListener('click', () => { calFocusDate = calAddMonths(calFocusDate, calMode === 'days' ? -1 : -12); renderCal(false); });
    calNext.addEventListener('click', () => { calFocusDate = calAddMonths(calFocusDate, calMode === 'days' ? 1 : 12); renderCal(false); });
    calTitle.addEventListener('click', () => setCalMode(calMode === 'days' ? 'months' : 'days', true));
    calScrim.addEventListener('click', () => closeCal(true));

    calGrid.addEventListener('click', e => {
        const b = e.target.closest('.cal-day');
        if (b && !b.disabled) selectCalDate(new Date(Number(b.dataset.t)));
    });
    calMonths.addEventListener('click', e => {
        const b = e.target.closest('.cal-month');
        if (!b) return;
        const y = calFocusDate.getFullYear();
        const k = Number(b.dataset.m);
        calFocusDate = calDay(y, k, Math.min(calFocusDate.getDate(), calDaysIn(y, k)));
        setCalMode('days', true);
    });

    calGrid.addEventListener('keydown', e => {
        if (!e.target.closest('.cal-day') || e.altKey || e.ctrlKey || e.metaKey) return;
        const f = calFocusDate;
        const y = f.getFullYear();
        const m = f.getMonth();
        const d = f.getDate();
        const wd = (f.getDay() + 6) % 7;
        let n = null;
        switch (e.key) {
            case 'ArrowLeft': n = calDay(y, m, d - 1); break;
            case 'ArrowRight': n = calDay(y, m, d + 1); break;
            case 'ArrowUp': n = calDay(y, m, d - 7); break;
            case 'ArrowDown': n = calDay(y, m, d + 7); break;
            case 'Home': n = calDay(y, m, d - wd); break;
            case 'End': n = calDay(y, m, d + (6 - wd)); break;
            case 'PageUp': n = calAddMonths(f, e.shiftKey ? -12 : -1); break;
            case 'PageDown': n = calAddMonths(f, e.shiftKey ? 12 : 1); break;
            default: return;
        }
        e.preventDefault();
        calFocusDate = clampCalDate(n);
        renderCal(true);
    });
    calMonths.addEventListener('keydown', e => {
        if (!e.target.closest('.cal-month') || e.altKey || e.ctrlKey || e.metaKey) return;
        const f = calFocusDate;
        const y = f.getFullYear();
        const m = f.getMonth();
        let k = m;
        switch (e.key) {
            case 'ArrowLeft': k = m - 1; break;
            case 'ArrowRight': k = m + 1; break;
            case 'ArrowUp': k = m - 3; break;
            case 'ArrowDown': k = m + 3; break;
            case 'Home': k = 0; break;
            case 'End': k = 11; break;
            case 'PageUp': e.preventDefault(); calFocusDate = calAddMonths(f, -12); renderCal(true); return;
            case 'PageDown': e.preventDefault(); calFocusDate = calAddMonths(f, 12); renderCal(true); return;
            default: return;
        }
        e.preventDefault();
        k = Math.max(0, Math.min(11, k));
        calFocusDate = calDay(y, k, Math.min(f.getDate(), calDaysIn(y, k)));
        renderCal(true);
    });

    calEl.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const items = Array.from(calEl.querySelectorAll('button:not([disabled])')).filter(b => b.tabIndex >= 0 && b.getClientRects().length);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !calEl.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !calEl.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && calOpen) { e.preventDefault(); closeCal(true); } });
    document.addEventListener('pointerdown', e => {
        if (!calOpen) return;
        const t = e.target;
        if (calEl.contains(t) || calBtn.contains(t) || t === calScrim || (t.closest && t.closest('.datebar'))) return;
        closeCal(false);
    });
    window.addEventListener('resize', () => { if (calOpen) placeCal(); });
    map.on('movestart', () => closeCal(false));

    function getTimeZone(lat, lng) {
        const wrappedLng = ((lng + 180) % 360 + 360) % 360 - 180;
        const clampedLat = Math.max(-90, Math.min(90, lat));
        try {
            return tzlookup(clampedLat, wrappedLng) || 'UTC';
        } catch (error) {
            console.error("Error fetching timezone data: ", error);
            return 'UTC';
        }
    }

    function getSunTimes(lat, lng) {
        const timeZone = getTimeZone(lat, lng);
        const noon = moment.tz({ year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), hour: 12 }, timeZone).toDate();
        return { timeZone, times: SunCalc.getTimes(noon, lat, lng) };
    }

    function setSelectedDate(year, month, day) {
        date.setTime(new Date(year, month, day, 12).getTime());
        updateDateLabel();
    }

    function formatDateLabel(d) {
        const base = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
        return d.getFullYear() === today.getFullYear() ? base : `${base} ${d.getFullYear()}`;
    }

    function isToday(d) {
        return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    }

    function updateDateLabel() {
        const label = formatDateLabel(date);
        el('dateLabel').textContent = label;
        const tod = isToday(date);
        if (tod) calBtn.setAttribute('aria-current', 'date'); else calBtn.removeAttribute('aria-current');
        calBtn.setAttribute('aria-label', `Choose date. Selected: ${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${tod ? ', today' : ''}`);
    }

    function refresh() {
        const center = map.getCenter();
        calculateGoldenHour(center);
        drawSunArrows(center);
        syncUrl(center);
    }

    let urlTimer = null;
    function syncUrl(center) {
        clearTimeout(urlTimer);
        urlTimer = setTimeout(() => {
            try {
                const c = center.wrap();
                const pad = n => String(n).padStart(2, '0');
                const dateStr = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
                const q = `?lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}&date=${dateStr}`;
                history.replaceState(null, '', window.location.pathname + q);
            } catch (e) { }
        }, 400);
    }

    function formatTime(d, timeZone) {
        return moment(d).tz(timeZone).format('HH:mm');
    }

    function bearingAt(time, lat, lng) {
        const az = SunCalc.getPosition(time, lat, lng).azimuth * (180 / Math.PI) + 180;
        return ((az % 360) + 360) % 360;
    }

    function directionText(time, lat, lng) {
        const b = bearingAt(time, lat, lng);
        return `${CARDINALS[Math.round(b / 45) % 8]} ${Math.round(b)}\u00b0`;
    }

    function setText(node, value) {
        if (node.textContent !== value) node.textContent = value;
    }
    function setDirText(node, value) {
        if (node.textContent === value) return;
        node.textContent = '';
        const m = /^(.*?)(\u00b0)$/.exec(value);
        if (!m) { node.textContent = value; return; }
        const deg = document.createElement('span');
        deg.className = 'deg'; deg.textContent = m[2];
        node.append(m[1], deg);
    }

    function setState(state) {
        dock.dataset.state = state;
        refs.windows.hidden = state !== 'normal';
        refs.notice.hidden = state === 'normal';
    }

    function calculateGoldenHour(latlng) {
        const { lat, lng } = latlng;
        const { timeZone, times } = getSunTimes(lat, lng);

        const sunrise = times.sunrise ? new Date(times.sunrise) : NaN;
        const sunset = times.sunset ? new Date(times.sunset) : NaN;

        updateDateLabel();

        let signature;

        if (isNaN(sunrise) && isNaN(sunset)) {
            const noonAltitude = SunCalc.getPosition(times.solarNoon, lat, lng).altitude;
            if (noonAltitude > 0) {
                setState('polar-day');
                refs.noticeIcon.setAttribute('href', '#i-sun');
                setText(refs.noticeTitle, 'Polar day');
                setText(refs.noticeText, 'The sun stays above the horizon all day here, so there is no sunrise or sunset golden hour.');
            } else {
                setState('polar-night');
                refs.noticeIcon.setAttribute('href', '#i-moon');
                setText(refs.noticeTitle, 'Polar night');
                setText(refs.noticeText, 'The sun stays below the horizon all day here, so there is no sunrise or sunset golden hour.');
            }
            sunInfo = { state: dock.dataset.state, timeZone };
            signature = dock.dataset.state;
        } else if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
            setState('partial');
            refs.noticeIcon.setAttribute('href', '#i-sun');
            setText(refs.noticeTitle, 'No golden hour today');
            setText(refs.noticeText, 'No sunrise or sunset at this location.');
            sunInfo = { state: 'partial', timeZone };
            signature = 'partial';
        } else {
            setState('normal');
            const amFrom = formatTime(sunrise, timeZone);
            const amTo = formatTime(new Date(sunrise.getTime() + 3600000), timeZone);
            const pmFrom = formatTime(new Date(sunset.getTime() - 3600000), timeZone);
            const pmTo = formatTime(sunset, timeZone);
            signature = [amFrom, amTo, pmFrom, pmTo, timeZone].join('|');

            const changedAm = refs.amFrom.textContent !== amFrom || refs.amTo.textContent !== amTo;
            const changedPm = refs.pmFrom.textContent !== pmFrom || refs.pmTo.textContent !== pmTo;
            setText(refs.amFrom, amFrom); setText(refs.amTo, amTo);
            setText(refs.pmFrom, pmFrom); setText(refs.pmTo, pmTo);
                    setText(refs.sunriseTime, formatTime(sunrise, timeZone));
            setText(refs.sunsetTime, formatTime(sunset, timeZone));
            const riseDir = directionText(sunrise, lat, lng);
            const setDir = directionText(sunset, lat, lng);
            setDirText(refs.sunriseDir, riseDir);
            setDirText(refs.sunsetDir, setDir);

            if (signature !== lastSignature) {
                if (changedAm) pop(refs.miniAm);
                if (changedPm) pop(refs.miniPm);
            }
            sunInfo = { state: 'normal', timeZone, lat, lng, sunrise, sunset, amFrom, amTo, pmFrom, pmTo };
        }

        drawArc();
        updateNow();

        if (signature !== lastSignature) {
            lastSignature = signature;
            if (dock.dataset.state === 'normal') {
                announce(`${timeZone.replace(/_/g, ' ')}, ${formatDateLabel(date)}. Morning golden hour ${refs.amFrom.textContent} to ${refs.amTo.textContent}. Evening golden hour ${refs.pmFrom.textContent} to ${refs.pmTo.textContent}.`);
            } else {
                announce(`${timeZone.replace(/_/g, ' ')}, ${formatDateLabel(date)}. ${refs.noticeTitle.textContent}. ${refs.noticeText.textContent}`);
            }
        }
    }

    function pop(node) {
        if (!node || reducedMotion() || !node.animate) return;
        node.animate(
            [{ opacity: 0.35, transform: 'translateY(8px) scale(0.985)' }, { opacity: 1, transform: 'none' }],
            { duration: 460, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' }
        );
    }

    const minuteOf = ms => Math.floor(ms / 60000);

    function nowFor(info, nowMs) {
        const out = { now: null, frac: null };
        if (!info || info.state !== 'normal') return out;
        const nowLoc = moment.tz(nowMs, info.timeZone);
        const sameDay = nowLoc.year() === date.getFullYear() && nowLoc.month() === date.getMonth() && nowLoc.date() === date.getDate();
        if (!sameDay) return out;
        const sr = info.sunrise.getTime();
        const ss = info.sunset.getTime();
        const nowMin = minuteOf(nowMs);
        const am0 = minuteOf(sr), am1 = minuteOf(sr + 3600000);
        const pm0 = minuteOf(ss - 3600000), pm1 = minuteOf(ss);
        out.frac = (nowMs >= sr && nowMs <= ss) ? (nowMs - sr) / (ss - sr) : null;
        if (nowMin >= am0 && nowMin < am1) out.now = 'am';
        else if (nowMin >= pm0 && nowMin < pm1) out.now = 'pm';
        return out;
    }

    function updateNow() {
        const s = nowFor(sunInfo, Date.now());
        refs.miniAm.classList.toggle('is-now', s.now === 'am');
        refs.miniPm.classList.toggle('is-now', s.now === 'pm');
        refs.nowAm.hidden = s.now !== 'am';
        refs.nowPm.hidden = s.now !== 'pm';
        document.querySelector('.map-centre')?.classList.toggle('is-golden', s.now !== null);
        placeNowDot(s.frac);
    }
    setInterval(updateNow, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateNow(); });
    const arcEl = el('arc');
    const ARC = { cx: 156, hy: 156, r: 150 };
    let arcNow = null;

    function arcPt(f) {
        const a = f * Math.PI;
        return [ARC.cx - ARC.r * Math.cos(a), ARC.hy - ARC.r * Math.sin(a)];
    }
    function arcPath(f0, f1) {
        const p = arcPt(f0), q = arcPt(f1);
        return `M${p[0].toFixed(2)} ${p[1].toFixed(2)}A${ARC.r} ${ARC.r} 0 0 1 ${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
    }
    function clearArc() {
        arcEl.textContent = '';
        arcNow = null;
    }
    function drawArc() {
        if (!sunInfo || sunInfo.state !== 'normal') { clearArc(); return; }
        const day = sunInfo.sunset.getTime() - sunInfo.sunrise.getTime();
        const g = Math.min(0.5, 3600000 / day);
        const p0 = arcPt(0);
        const p1 = arcPt(1);
        const am = arcPath(0, g);
        const pm = arcPath(1 - g, 1);
        arcEl.innerHTML =
            '<defs>' +
            '<linearGradient id="arcGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd46b"/><stop offset="1" stop-color="#f5a00b"/></linearGradient>' +
            '<radialGradient id="arcEnd"><stop offset="0" stop-color="#f5a00b" stop-opacity="0.3"/><stop offset="1" stop-color="#f5a00b" stop-opacity="0"/></radialGradient>' +
            '<radialGradient id="arcHalo"><stop offset="0" stop-color="#f5a00b" stop-opacity="0.55"/><stop offset="1" stop-color="#f5a00b" stop-opacity="0"/></radialGradient>' +
            '<linearGradient id="arcFade" gradientUnits="userSpaceOnUse" x1="0" y1="152" x2="0" y2="170"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>' +
            '<mask id="arcAbove" maskUnits="userSpaceOnUse" x="-40" y="-14" width="392" height="186"><rect x="-40" y="-14" width="392" height="170" fill="#fff"/><rect x="-40" y="152" width="392" height="20" fill="url(#arcFade)"/></mask>' +
            '<filter id="arcBlur" filterUnits="userSpaceOnUse" x="-40" y="-14" width="392" height="186"><feGaussianBlur stdDeviation="4"/></filter>' +
            '</defs>' +
            `<g mask="url(#arcAbove)"><circle cx="${p0[0].toFixed(1)}" cy="${ARC.hy}" r="38" fill="url(#arcEnd)"/>` +
            `<circle cx="${p1[0].toFixed(1)}" cy="${ARC.hy}" r="38" fill="url(#arcEnd)"/></g>` +
            `<line class="arc-horizon" x1="0" y1="${ARC.hy}" x2="312" y2="${ARC.hy}"/>` +
            `<path class="arc-base" d="${arcPath(0, 1)}"/>` +
            `<g mask="url(#arcAbove)"><g filter="url(#arcBlur)"><path class="arc-glow" d="${am}"/><path class="arc-glow" d="${pm}"/></g></g>` +
            `<path class="arc-gold arc-gold-am" d="${am}"/><path class="arc-gold arc-gold-pm" d="${pm}"/>` +
            '<g id="arcNow" style="display:none"><circle class="arc-now-halo" r="18"/><circle class="arc-now-dot" r="6.5"/></g>';
        arcNow = arcEl.querySelector('#arcNow');
        arcEl.setAttribute('aria-label',
            `Sun path. Sunrise ${refs.sunriseTime.textContent}, morning golden hour ${sunInfo.amFrom} to ${sunInfo.amTo}, ` +
            `evening golden hour ${sunInfo.pmFrom} to ${sunInfo.pmTo}, sunset ${refs.sunsetTime.textContent}.`);
    }
    function placeNowDot(f) {
        if (!arcNow) return;
        if (f === null || f === undefined) { arcNow.style.display = 'none'; return; }
        const p = arcPt(Math.min(1, Math.max(0, f)));
        arcNow.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
        arcNow.dataset.f = f.toFixed(4);
        arcNow.style.display = '';
    }

    const mapEl = el('map');
    const arrowsEl = el('sunArrows');
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let arrowTimes = { rise: null, set: null };

    const raysEl = svgEl('svg', { class: 'sun-rays', 'aria-hidden': 'true', focusable: 'false' });
    arrowsEl.after(raysEl);
    let rayAngles = { rise: null, set: null };
    let rayBearings = { rise: null, set: null };
    let rayKind = null;
    let pinKind = null;
    let raySource = null;

    function rayTransform(size, angle) {
        return `translate(${size.x / 2} ${size.y / 2}) rotate(${angle.toFixed(2)})`;
    }
    function buildRays(size) {
        raysEl.textContent = '';
        raysEl.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);
        const len = Math.ceil(Math.hypot(size.x, size.y) / 2) + 24;
        const defs = svgEl('defs');
        [['sunRayLight', '#fff', 0.9, 0.1], ['sunRayDark', '#000', 0.3, 0]].forEach(g => {
            const grad = svgEl('linearGradient', { id: g[0], gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: len, y2: 0 });
            grad.appendChild(svgEl('stop', { offset: 0, 'stop-color': g[1], 'stop-opacity': g[2] }));
            grad.appendChild(svgEl('stop', { offset: 1, 'stop-color': g[1], 'stop-opacity': g[3] }));
            defs.appendChild(grad);
        });
        raysEl.appendChild(defs);
        ['set', 'rise'].forEach(kind => {
            if (rayAngles[kind] === null) return;
            const holder = svgEl('g', { class: 'sun-ray sun-ray--' + kind, transform: rayTransform(size, rayAngles[kind]) });
            const grow = svgEl('g', { class: 'sun-ray-grow' });
            grow.appendChild(svgEl('rect', { x: 13, y: -2.5, width: len, height: 5, rx: 2.5, fill: 'url(#sunRayDark)' }));
            grow.appendChild(svgEl('rect', { x: 13, y: -1, width: len, height: 2, rx: 1, fill: 'url(#sunRayLight)' }));
            holder.appendChild(grow);
            raysEl.appendChild(holder);
        });
    }
    function updateRayAngle() {
        const kind = rayKind || pinKind;
        if (!kind || rayBearings[kind] === null) return;
        const node = raysEl.querySelector('.sun-ray--' + kind);
        if (!node) return;
        rayAngles[kind] = screenAngle(map.getCenter(), rayBearings[kind]);
        node.setAttribute('transform', rayTransform(map.getSize(), rayAngles[kind]));
    }
    function showRay() {
        raysEl.setAttribute('data-on', rayKind || pinKind || '');
        updateRayAngle();
    }
    function setRay(kind, source) {
        rayKind = kind;
        raySource = kind ? (source || null) : null;
        showRay();
    }
    function togglePin(kind) {
        pinKind = (pinKind === kind) ? null : kind;
        [['rise', el('miniAm')], ['set', el('miniPm')]].forEach(p => p[1] && p[1].setAttribute('aria-pressed', String(pinKind === p[0])));
        showRay();
    }
    function bindPin(node, kind) {
        if (!node) return;
        node.setAttribute('role', 'button');
        node.setAttribute('tabindex', '0');
        node.setAttribute('aria-pressed', 'false');
        node.addEventListener('click', () => togglePin(kind));
        node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePin(kind); } });
    }

    function bindRay(node, kind) {
        if (!node) return;
        node.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') setRay(kind); });
        node.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && rayKind === kind) setRay(null); });
        node.addEventListener('focusin', () => setRay(kind));
        node.addEventListener('focusout', () => { if (rayKind === kind) setRay(null); });
        node.addEventListener('touchstart', () => setRay(kind), { passive: true });
        ['touchend', 'touchcancel'].forEach(t => node.addEventListener(t, () => { if (rayKind === kind) setRay(null); }, { passive: true }));
    }
    bindRay(el('miniAm'), 'rise');
    bindRay(el('miniPm'), 'set');
    bindPin(el('miniAm'), 'rise');
    bindPin(el('miniPm'), 'set');
    bindRay(document.querySelector('.arc-end-l'), 'rise');
    bindRay(document.querySelector('.arc-end-r'), 'set');
    const chevronHit = e => (e.target && e.target.closest) ? e.target.closest('.sun-chevron-hit') : null;
    arrowsEl.addEventListener('pointerover', e => { const h = chevronHit(e); if (h && e.pointerType !== 'touch') setRay(h.dataset.kind, 'chevron'); });
    arrowsEl.addEventListener('pointerout', e => { const h = chevronHit(e); if (h && e.pointerType !== 'touch' && rayKind === h.dataset.kind) setRay(null); });
    arrowsEl.addEventListener('touchstart', e => { const h = chevronHit(e); if (h) setRay(h.dataset.kind, 'chevron'); }, { passive: true });
    ['touchend', 'touchcancel'].forEach(t => arrowsEl.addEventListener(t, () => { if (raySource === 'chevron') setRay(null); }, { passive: true }));

    let lastPointerType = '';
    document.addEventListener('pointerdown', e => { lastPointerType = e.pointerType; }, true);
    document.addEventListener('contextmenu', e => {
        const t = e.target;
        if (!t || !t.closest || t.closest('input, textarea, [contenteditable]')) return;
        const touch = e.pointerType ? e.pointerType === 'touch' : lastPointerType === 'touch';
        if (touch && t.closest('#map, .sun-arrows, .sun-rays, #dock, #tools')) e.preventDefault();
    });

    function geoDestination(lat, lng, bearingDeg, distanceKm) {
        const R = 6378.1;
        const brng = bearingDeg * (Math.PI / 180);
        const lat1 = lat * (Math.PI / 180);
        const lng1 = lng * (Math.PI / 180);
        const d = distanceKm / R;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
        const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
        return L.latLng(lat2 * (180 / Math.PI), lng2 * (180 / Math.PI));
    }

    function screenAngle(center, bearing) {
        const end = geoDestination(center.lat, center.lng, bearing, 1);
        const p0 = map.project(center);
        const p1 = map.project(end);
        return Math.atan2(p1.y - p0.y, p1.x - p0.x) * (180 / Math.PI);
    }

    function svgEl(name, attrs) {
        const node = document.createElementNS(SVG_NS, name);
        Object.keys(attrs || {}).forEach(k => node.setAttribute(k, attrs[k]));
        return node;
    }

    function buildChevron(kind, angle, bearing, tip) {
        const half = 55 * Math.PI / 180;
        const back = tip - 9.5 * Math.cos(half);
        const side = 9.5 * Math.sin(half);
        const d = `M${back.toFixed(2)} ${(-side).toFixed(2)}L${tip} 0L${back.toFixed(2)} ${side.toFixed(2)}`;
        const g = svgEl('g', { class: 'sun-chevron sun-chevron--' + kind, transform: `rotate(${angle.toFixed(2)})` });
        g.dataset.bearing = bearing.toFixed(1);
        g.dataset.angle = angle.toFixed(1);
        g.appendChild(svgEl('path', { class: 'sun-chevron-ink', d }));
        const hit = svgEl('circle', { class: 'sun-chevron-hit', cx: tip - 3, cy: 0, r: 18 });
        hit.dataset.kind = kind;
        g.appendChild(hit);
        return g;
    }

    function renderSunArrows(center) {
        arrowsEl.textContent = '';
        rayAngles = { rise: null, set: null };
        rayBearings = { rise: null, set: null };
        const size = map.getSize();
        arrowsEl.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);
        const defs = svgEl('defs');
        const shadow = svgEl('filter', { id: 'sunArrowShadow', x: '-100%', y: '-100%', width: '300%', height: '300%' });
        shadow.appendChild(svgEl('feDropShadow', { dx: 0, dy: 1, stdDeviation: 1.5, 'flood-color': '#000', 'flood-opacity': 0.45 }));
        defs.appendChild(shadow);
        arrowsEl.appendChild(defs);
        const tip = Math.max(91, Math.min(200, Math.min(size.x, size.y) * 0.17));
        ['set', 'rise'].forEach(kind => {
            const time = arrowTimes[kind];
            if (!time) return;
            const bearing = bearingAt(time, center.lat, center.lng);
            const angle = screenAngle(center, bearing);
            rayAngles[kind] = angle;
            rayBearings[kind] = bearing;
            const holder = svgEl('g', { transform: `translate(${size.x / 2} ${size.y / 2})`, filter: 'url(#sunArrowShadow)' });
            holder.appendChild(buildChevron(kind, angle, bearing, tip));
            arrowsEl.appendChild(holder);
        });
        buildRays(size);
        if (raySource === 'chevron' && !arrowsEl.querySelector('.sun-chevron-hit:hover')) setRay(null);
    }
    function drawSunArrows(center) {
        const { times } = getSunTimes(center.lat, center.lng);
        const valid = t => (t && !isNaN(new Date(t).getTime())) ? new Date(t) : null;
        arrowTimes = { rise: valid(times.sunrise), set: valid(times.sunset) };
        renderSunArrows(center);
    }

    map.on('resize', () => renderSunArrows(map.getCenter()));

    function sunArrowsFade() {
        mapEl.classList.add('is-moving');
        setTimeout(() => mapEl.classList.remove('is-moving'), 200);
    }
    function changeSunArrows(fn) {
        mapEl.classList.add('is-moving');
        fn();
        setTimeout(() => mapEl.classList.remove('is-moving'), 90);
    }

    map.on('movestart', () => mapEl.classList.add('is-moving'));
    map.on('moveend', () => {
        refresh();
        setTimeout(() => mapEl.classList.remove('is-moving'), 90);
    });

    const zoomInBtn = el('zoomIn');
    const zoomOutBtn = el('zoomOut');
    zoomInBtn.addEventListener('click', () => map.zoomIn());
    zoomOutBtn.addEventListener('click', () => map.zoomOut());
    function updateZoomButtons() {
        zoomInBtn.disabled = map.getZoom() >= map.getMaxZoom();
        zoomOutBtn.disabled = map.getZoom() <= map.getMinZoom();
    }
    map.on('zoomend', updateZoomButtons);
    updateZoomButtons();

    const tools = el('tools');
    const toolsBtn = el('toolsBtn');
    const toolsMenu = el('toolsMenu');
    const menuIsOpen = () => !toolsMenu.hidden;
    const menuItems = () => Array.from(toolsMenu.querySelectorAll('[role="menuitem"]')).filter(b => !b.disabled && b.offsetParent !== null);
    function closeToolsMenu(returnFocus) {
        if (!menuIsOpen()) return;
        toolsMenu.hidden = true;
        toolsBtn.setAttribute('aria-expanded', 'false');
        if (returnFocus) toolsBtn.focus({ preventScroll: true });
    }
    function openToolsMenu(focus) {
        if (!menuIsOpen()) {
            closeCal(false);
            if (!privacyPanel.hidden) setPrivacyPanel(false, false);
            toolsMenu.hidden = false;
            toolsBtn.setAttribute('aria-expanded', 'true');
        }
        const items = menuItems();
        if (focus && items.length) items[focus === 'last' ? items.length - 1 : 0].focus({ preventScroll: true });
    }
    toolsBtn.addEventListener('click', e => {
        if (menuIsOpen()) closeToolsMenu(false);
        else openToolsMenu(e.detail === 0 ? 'first' : null);
    });
    toolsBtn.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); openToolsMenu('first'); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); openToolsMenu('last'); }
    });
    toolsMenu.addEventListener('keydown', e => {
        const items = menuItems();
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === 'Tab') closeToolsMenu(false);
    });
    toolsMenu.addEventListener('click', e => {
        const item = e.target.closest('.menu-item');
        if (item && !item.dataset.keep) closeToolsMenu(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuIsOpen() && !calOpen) { e.preventDefault(); closeToolsMenu(true); } });
    document.addEventListener('pointerdown', e => { if (menuIsOpen() && !tools.contains(e.target)) closeToolsMenu(false); });
    map.on('dragstart', () => closeToolsMenu(false));
    el('menuLocate').addEventListener('click', () => locateBtn.click());

    const expandBtn = el('expandBtn');
    function setDockExpanded(open) {
        dock.dataset.expanded = String(open);
        expandBtn.setAttribute('aria-expanded', String(open));
        const label = open ? 'Hide the sun path' : 'Show the sun path';
        expandBtn.setAttribute('aria-label', label);
        expandBtn.title = label;
    }
    expandBtn.addEventListener('click', () => setDockExpanded(dock.dataset.expanded !== 'true'));
    setDockExpanded(false);

    const attrib = el('attribution');
    const attribToggle = el('attribToggle');
    const attribPop = el('attribPop');
    const attribClose = el('attribClose');
    function setAttribOpen(open, returnFocus) {
        attribPop.hidden = !open;
        attribToggle.setAttribute('aria-expanded', String(open));
        if (open) attribClose.focus({ preventScroll: true });
        else if (returnFocus) attribToggle.focus({ preventScroll: true });
    }
    const attribIsOpen = () => !attribPop.hidden;
    attribToggle.addEventListener('click', () => setAttribOpen(!attribIsOpen(), true));
    attribClose.addEventListener('click', () => setAttribOpen(false, true));
    document.addEventListener('pointerdown', e => { if (attribIsOpen() && !attrib.contains(e.target)) setAttribOpen(false, false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && attribIsOpen()) { e.preventDefault(); setAttribOpen(false, true); } });
    attrib.addEventListener('focusout', e => { if (attribIsOpen() && e.relatedTarget && !attrib.contains(e.relatedTarget)) setAttribOpen(false, false); });
    map.on('movestart', () => { if (attribIsOpen()) setAttribOpen(false, false); });

    let searchSeq = 0;
    const osmGeocoder = new L.Control.OSMGeocoder({
        collapsed: false,
        position: 'topleft',
        text: 'Search',
        placeholder: 'Search a place or coordinates',
        bounds: null,
        callback: onSearchResults,
        onError: () => { searchSeq++; showSearchStatus('Search is unavailable right now. Check your connection and try again.'); }
    });
    map.addControl(osmGeocoder);

    const searchBox = osmGeocoder.getContainer();
    const searchInput = osmGeocoder._input;
    const searchForm = osmGeocoder._form;
    searchBox.classList.add('glass', 'search');
    searchInput.type = 'search';
    searchInput.setAttribute('aria-label', 'Search a place or coordinates');
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('autocapitalize', 'off');
    searchInput.setAttribute('enterkeyhint', 'search');
    searchInput.spellcheck = false;
    searchInput.id = 'searchInput';
    searchForm.setAttribute('role', 'search');
    const searchSubmit = searchForm.querySelector('input[type=submit]');
    searchSubmit.setAttribute('aria-label', 'Search');
    searchSubmit.title = 'Search';
    searchSubmit.tabIndex = -1;
    searchSubmit.setAttribute('aria-hidden', 'true');
    searchForm.id = 'searchForm';

    const searchToggle = document.createElement('button');
    searchToggle.type = 'button';
    searchToggle.id = 'searchToggle';
    searchToggle.className = 'search-toggle';
    searchToggle.setAttribute('aria-label', 'Search');
    searchToggle.title = 'Search';
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.setAttribute('aria-controls', 'searchForm');
    searchToggle.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-search"></use></svg>';
    searchBox.insertBefore(searchToggle, searchBox.firstChild);

    const isSearchOpen = () => searchBox.classList.contains('is-open');
    function openSearch() {
        if (!isSearchOpen()) {
            searchBox.classList.add('is-open');
            appRoot.classList.add('is-searching');
            searchToggle.setAttribute('aria-expanded', 'true');
        }
        searchInput.focus({ preventScroll: true });
    }
    function collapseSearch(returnFocus, clear) {
        if (!isSearchOpen()) return;
        const ae = document.activeElement;
        const hadFocus = searchBox.contains(ae) || !ae || ae === document.body;
        closeResults();
        if (clear) searchInput.value = '';
        searchBox.classList.remove('is-open');
        appRoot.classList.remove('is-searching');
        searchToggle.setAttribute('aria-expanded', 'false');
        if (hadFocus) {
            if (returnFocus) searchToggle.focus({ preventScroll: true });
            else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        }
    }
    searchToggle.addEventListener('click', () => {
        if (!isSearchOpen()) { openSearch(); return; }
        if (searchInput.value.trim()) searchForm.requestSubmit ? searchForm.requestSubmit() : searchSubmit.click();
        else collapseSearch(true);
    });
    document.addEventListener('keydown', e => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (!welcome.hidden || calOpen) return;
        e.preventDefault();
        openSearch();
    });
    let searchPressing = false;
    searchBox.addEventListener('pointerdown', () => { searchPressing = true; setTimeout(() => { searchPressing = false; }, 400); });
    searchBox.addEventListener('focusout', () => {
        setTimeout(() => {
            if (!isSearchOpen() || searchPressing || searchBox.contains(document.activeElement)) return;
            if (!searchInput.value.trim()) collapseSearch(false);
        }, 0);
    });
    map.on('click', () => { if (isSearchOpen() && !searchInput.value.trim()) collapseSearch(false); });

    const resultsBox = document.createElement('div');
    resultsBox.className = 'search-results';
    resultsBox.id = 'searchResults';
    resultsBox.hidden = true;
    resultsBox.setAttribute('aria-live', 'polite');
    searchBox.appendChild(resultsBox);

    searchForm.addEventListener('submit', () => {
        if (!searchInput.value.trim()) { closeResults(); return; }
        const seq = ++searchSeq;
        showSearchStatus('Searching\u2026', true);
        setTimeout(() => {
            if (seq === searchSeq && resultsBox.dataset.busy === '1') showSearchStatus('No answer from the search service. Please try again.');
        }, 9000);
    }, true);

    function closeResults() {
        searchSeq++;
        resultsBox.hidden = true;
        resultsBox.textContent = '';
        resultsBox.dataset.busy = '0';
        searchBox.classList.remove('has-results');
    }

    function showSearchStatus(text, busy) {
        resultsBox.textContent = '';
        const p = document.createElement('p');
        p.className = 'search-status';
        p.textContent = text;
        resultsBox.appendChild(p);
        resultsBox.dataset.busy = busy ? '1' : '0';
        resultsBox.hidden = false;
        searchBox.classList.add('has-results');
    }

    function pickResult(result, label) {
        const [firstLat, secondLat, firstLng, secondLng] = result.boundingbox.map(Number);
        const bounds = new L.LatLngBounds([firstLat, firstLng], [secondLat, secondLng]);
        map.fitBounds(bounds);
        if (label) searchInput.value = label;
        collapseSearch(true);
    }

    function onSearchResults(results) {
        searchSeq++;
        if (!results || !results.length) {
            showSearchStatus('No places found. Try another name, or coordinates like 51.5, -0.12');
            return;
        }
        if (results.length === 1 && /^Position:/.test(results[0].display_name || '')) {
            pickResult(results[0], `${results[0].lat}, ${results[0].lon}`);
            return;
        }
        resultsBox.textContent = '';
        resultsBox.dataset.busy = '0';
        const list = document.createElement('ul');
        list.className = 'result-list';
        const seen = new Set();
        results.filter(r => {
            const key = String(r.display_name || '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 5).forEach(result => {
            const parts = String(result.display_name || '').split(', ');
            const title = parts[0] || 'Result';
            const detail = parts.slice(1, 4).join(', ');
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'result';
            btn.innerHTML = '<svg class="ic ic-sm" aria-hidden="true"><use href="#i-pin"></use></svg><span class="result-text"><span class="result-title"></span><span class="result-detail"></span></span>';
            btn.querySelector('.result-title').textContent = title;
            btn.querySelector('.result-detail').textContent = detail;
            btn.addEventListener('click', () => pickResult(result, title));
            li.appendChild(btn);
            list.appendChild(li);
        });
        resultsBox.appendChild(list);
        resultsBox.hidden = false;
        searchBox.classList.add('has-results');
    }

    searchBox.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (!resultsBox.hidden) { closeResults(); searchInput.focus(); }
            else collapseSearch(true, true);
            return;
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = Array.from(resultsBox.querySelectorAll('.result'));
        if (!items.length) return;
        e.preventDefault();
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') (items[idx + 1] || items[0]).focus();
        else if (idx <= 0) searchInput.focus();
        else items[idx - 1].focus();
    });
    searchInput.addEventListener('focus', () => searchInput.select());
    searchInput.addEventListener('input', () => { if (!searchInput.value) closeResults(); });
    document.addEventListener('pointerdown', e => {
        if (!resultsBox.hidden && !searchBox.contains(e.target)) closeResults();
    });
    map.on('movestart', () => { if (document.activeElement !== searchInput) closeResults(); });

    const locateBtn = el('locateBtn');
    const geo = L.geolet({
        position: 'bottomleft',
        className: 'locDot',
        minZoom: LOCATE_ZOOM,
        marker() {
            return L.marker(null, {
                icon: L.divIcon({
                    html: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><circle cx="6.6" cy="7.2" r="1.1" fill="#1a1a1a"/><circle cx="11.4" cy="7.2" r="1.1" fill="#1a1a1a"/><path d="M5.8 10.8Q9 13.8 12.2 10.8" fill="none" stroke="#1a1a1a" stroke-width="1.4" stroke-linecap="round"/></svg>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9],
                    className: 'loc-me'
                }),
                attribution: '<a href="https://github.com/rhlt/leaflet-geolet" target="_blank">Geolet</a>',
                zIndexOffset: 1000
            });
        },
        popupContent(latlng) {
            return `Your location: ${latlng.lat}, ${latlng.lng}`;
        }
    }).addTo(map);
    geo.getContainer().style.display = 'none';

    if (!L.Geolet.browserSupport) {
        locateBtn.hidden = true;
        el('menuLocate').hidden = true;
    }
    locateBtn.addEventListener('click', () => {
        if (geo.isActive()) geo.deactivate(); else geo.activate();
        syncLocate();
    });
    function syncLocate() {
        const active = geo.isActive();
        locateBtn.classList.toggle('is-active', active);
        locateBtn.setAttribute('aria-pressed', String(active));
        const label = active ? 'Stop showing my location' : 'Show my location';
        locateBtn.setAttribute('aria-label', label);
        locateBtn.title = label;
        setText(el('menuLocateText'), label);
    }
    map.on('geolet_success', syncLocate);
    map.on('geolet_error', () => {
        syncLocate();
        showToast('Couldn\u2019t find your location. Check location permission.');
    });

    const supportPrompt = el('supportPrompt');
    const DAY_MS = 86400000;
    const SUPPORT_FORCED = params.get('support') === '1';
    const dNow = new Date();
    const dayKey = dNow.getFullYear() + '-' + (dNow.getMonth() + 1) + '-' + dNow.getDate();
    let sState = null;
    try {
        const stored = JSON.parse(localStorage.getItem('ghm-support') || '{}') || {};
        sState = { days: Array.isArray(stored.days) ? stored.days.slice(-8) : [], sessions: Number(stored.sessions) || 0, until: Number(stored.until) || 0 };
        if (sState.days.indexOf(dayKey) < 0) sState.days.push(dayKey);
        sState.days = sState.days.slice(-8);
        sState.sessions = Math.min(sState.sessions + 1, 999);
        localStorage.setItem('ghm-support', JSON.stringify(sState));
    } catch (e) { sState = null; }
    function sSnooze(days) {
        if (!sState || SUPPORT_FORCED) return;
        sState.until = Math.max(sState.until, Date.now() + days * DAY_MS);
        try { localStorage.setItem('ghm-support', JSON.stringify(sState)); } catch (e) { sState = null; }
    }

    let sStarted = false;
    let sActions = 0;
    let sShown = false;
    let sTimer = null;
    let sTries = 0;
    let sWatch = null;

    function supportEligible() {
        if (SUPPORT_FORCED) return true;
        if (!sState || Date.now() < sState.until) return false;
        if (sState.days.length >= SUPPORT.MIN_VISIT_DAYS) return true;
        return sState.sessions >= 2 && sActions >= SUPPORT.MIN_ACTIONS;
    }
    function supportOverlayOpen() {
        return tourOpen || !welcome.hidden || calOpen || menuIsOpen() || attribIsOpen() || !privacyPanel.hidden || appRoot.classList.contains('is-searching');
    }
    function supportCollides() {
        const r = supportPrompt.getBoundingClientRect();
        const hit = (b, pad) => b && b.width > 0 && b.height > 0 && !(b.right + pad <= r.left || b.left - pad >= r.right || b.bottom + pad <= r.top || b.top - pad >= r.bottom);
        const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        if (hit({ left: cx, right: cx, top: cy, bottom: cy, width: 1, height: 1 }, 28)) return true;
        return ['dock', 'searchToggle', 'toolsBtn', 'locateBtn', 'shareFab', 'attribToggle'].some(id => hit(el(id).getBoundingClientRect(), 4));
    }
    function supportSchedule() {
        if (sShown || sTimer || !sStarted || !supportEligible()) return;
        sTimer = setTimeout(supportTry, SUPPORT.DELAY_MS);
    }
    function supportRetry() { if (++sTries < 12) sTimer = setTimeout(supportTry, 5000); }
    function supportTry() {
        sTimer = null;
        if (sShown) return;
        if (supportOverlayOpen()) { supportRetry(); return; }
        supportPrompt.hidden = false;
        supportPrompt.style.transform = 'none';
        const clash = supportCollides();
        supportPrompt.style.transform = '';
        if (clash) { supportPrompt.hidden = true; supportRetry(); return; }
        sShown = true;
        sSnooze(SUPPORT.COOLDOWN_SHOWN_DAYS);
        requestAnimationFrame(() => supportPrompt.classList.add('show'));
        sWatch = setInterval(() => {
            const away = supportOverlayOpen();
            supportPrompt.classList.toggle('is-away', away);
            if (away) supportPrompt.setAttribute('inert', ''); else supportPrompt.removeAttribute('inert');
        }, 300);
    }
    function supportHide(snoozeDays, returnFocus) {
        clearInterval(sWatch);
        clearTimeout(sTimer);
        sShown = true;
        const hadFocus = supportPrompt.contains(document.activeElement);
        supportPrompt.classList.remove('show');
        setTimeout(() => { supportPrompt.hidden = true; }, reducedMotion() ? 0 : 350);
        if (snoozeDays) sSnooze(snoozeDays);
        if (hadFocus || returnFocus) toolsBtn.focus({ preventScroll: true });
    }
    function supportAction() {
        if (!sStarted || !welcome.hidden) return;
        sActions++;
        supportSchedule();
    }
    function supportWelcomeClosed() {
        sStarted = true;
        supportSchedule();
    }

    let sLastCenter = map.getCenter();
    map.on('moveend', () => {
        const c = map.getCenter();
        const moved = Math.abs(c.lat - sLastCenter.lat) + Math.abs(c.lng - sLastCenter.lng) > 0.0005;
        sLastCenter = c;
        if (moved) supportAction();
    });

    el('spLater').addEventListener('click', () => supportHide(SUPPORT.COOLDOWN_DISMISSED_DAYS, false));
    supportPrompt.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); supportHide(SUPPORT.COOLDOWN_DISMISSED_DAYS, true); } });
    el('spSupport').addEventListener('click', () => {
        supportHide(SUPPORT.COOLDOWN_DONATED_DAYS, false);
        showToast('Thank you for supporting Golden Hour Map');
    });
    const supportLink = el('supportBtn');
    supportLink.addEventListener('click', () => {
        if (!supportPrompt.hidden) supportHide(0, false);
        sSnooze(SUPPORT.COOLDOWN_DONATED_DAYS);
        showToast('Thank you for supporting Golden Hour Map');
    });
    supportLink.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); supportLink.click(); } });
    const privacyPanel = el('privacyPanel');
    function setPrivacyPanel(open, returnFocus) {
        privacyPanel.hidden = !open;
        if (open) {
            refreshConsentUI();
            el('privacyClose').focus({ preventScroll: true });
        } else if (returnFocus) toolsBtn.focus({ preventScroll: true });
    }
    el('privacyBtn').addEventListener('click', () => setPrivacyPanel(true, false));
    el('privacyClose').addEventListener('click', () => setPrivacyPanel(false, true));
    el('prvAllow').addEventListener('click', () => {
        if (setConsent('granted')) showToast('Analytics cookies are on'); else showToast('Your browser blocks storage, so analytics stays off.');
    });
    el('prvDeny').addEventListener('click', () => { setConsent('denied'); showToast('Analytics cookies are off'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !privacyPanel.hidden) { e.preventDefault(); setPrivacyPanel(false, true); } });
    document.addEventListener('pointerdown', e => { if (!privacyPanel.hidden && !privacyPanel.contains(e.target) && !toolsBtn.contains(e.target)) setPrivacyPanel(false, false); });
    map.on('dragstart', () => { if (!privacyPanel.hidden) setPrivacyPanel(false, false); });

    const SHARE_HINT = { IDLE_MS: 10000, SHOW_MS: 10000, MAX_SHOWS: 3, FADE_MS: 400 };
    const shareWrap = el('shareWrap');
    let shareHintOn = false, shareHintShown = 0, shareIdleSince = 0, shareHintAt = 0, shareHintKey = '', shareHintFade = null;
    const sharePosKey = () => { const c = map.getCenter(); return c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + map.getZoom(); };
    function shareHintBlocked() {
        return document.hidden || tourOpen || tourQueued || !welcome.hidden || calOpen || menuIsOpen() || attribIsOpen() || !privacyPanel.hidden
            || !supportPrompt.hidden || !consentBanner.hidden || appRoot.classList.contains('is-searching') || mapEl.classList.contains('is-moving');
    }
    function showShareHint() {
        clearTimeout(shareHintFade);
        shareHintOn = true;
        shareHintShown++;
        shareHintAt = Date.now();
        shareHintKey = sharePosKey();
        shareWrap.classList.remove('is-leaving');
        shareWrap.classList.add('is-hint');
    }
    function hideShareHint() {
        shareIdleSince = 0;
        if (!shareHintOn) return;
        shareHintOn = false;
        shareWrap.classList.remove('is-hint');
        shareWrap.classList.add('is-leaving');
        clearTimeout(shareHintFade);
        shareHintFade = setTimeout(() => shareWrap.classList.remove('is-leaving'), (reducedMotion() ? 200 : SHARE_HINT.FADE_MS) + 60);
    }
    setInterval(() => {
        if (shareHintOn) {
            if (shareHintBlocked() || Date.now() - shareHintAt >= SHARE_HINT.SHOW_MS) hideShareHint();
            return;
        }
        if (shareUsed || shareHintShown >= SHARE_HINT.MAX_SHOWS || shareHintBlocked()) { shareIdleSince = 0; return; }
        if (!shareIdleSince) { shareIdleSince = Date.now(); return; }
        if (Date.now() - shareIdleSince > SHARE_HINT.IDLE_MS && sharePosKey() !== shareHintKey) showShareHint();
    }, 500);
    map.on('movestart zoomstart', hideShareHint);
    map.on('moveend zoomend', () => { shareIdleSince = 0; });
    document.addEventListener('pointerdown', e => {
        if (shareHintOn && e.target.closest && e.target.closest('button, a, input, select, textarea, [role="button"], .sun-chevron-hit, .leaflet-control')) hideShareHint();
    }, true);

    const dateMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(dateParam || '');
    if (dateMatch) {
        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const year = Number(dateMatch[3]);
        const parsed = new Date(year, month - 1, day, 12);
        if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
            setSelectedDate(year, month - 1, day);
        }
    }

    refresh();
    sunArrowsFade();
});
