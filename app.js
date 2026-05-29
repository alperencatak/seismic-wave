/* ==========================================================================
   SEISMIC WAVE — Multi-Source Application Controller & Live Data Engine
   ========================================================================== */

(function () {
    'use strict';

    // ── Multi-Source Configuration ──────────────────────────────────
    // Each source defines its endpoint(s), parser, and metadata.
    // Only sources with reliable CORS + JSON APIs are included.
    const DATA_SOURCES = {
        usgs: {
            name: 'USGS',
            flag: '🇺🇸',
            region: 'Global',
            feeds: {
                hour:  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
                day:   'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
                week:  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
                month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson'
            },
            parse: (data) => (data.features || []).map(f => ({
                id:     'usgs-' + f.id,
                source: 'usgs',
                mag:    f.properties.mag,
                place:  f.properties.place || 'Unknown',
                time:   f.properties.time,
                depth:  f.geometry.coordinates[2],
                lon:    f.geometry.coordinates[0],
                lat:    f.geometry.coordinates[1],
                tsunami: !!f.properties.tsunami,
                url:    f.properties.url
            }))
        },

        kandilli: {
            name: 'Kandilli (KOERI)',
            flag: '🇹🇷',
            region: 'Türkiye',
            feeds: {
                // Kandilli API always returns last 24h; we use limit param
                hour:  'https://api.orhanaydogdu.com.tr/deprem/kandilli/live?limit=100',
                day:   'https://api.orhanaydogdu.com.tr/deprem/kandilli/live?limit=100',
                week:  'https://api.orhanaydogdu.com.tr/deprem/kandilli/live?limit=100',
                month: 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live?limit=100'
            },
            parse: (data) => {
                if (!data.status || !data.result) return [];
                return data.result.map(eq => ({
                    id:     'kandilli-' + eq.earthquake_id,
                    source: 'kandilli',
                    mag:    eq.mag,
                    place:  eq.title || eq.location_properties?.closestCity?.name || 'Türkiye',
                    time:   eq.created_at ? eq.created_at * 1000 : new Date(eq.date_time || eq.date).getTime(),
                    depth:  eq.depth || 0,
                    lon:    eq.geojson?.coordinates?.[0] || eq.lng || eq.location_properties?.epiCenter?.lng || 0,
                    lat:    eq.geojson?.coordinates?.[1] || eq.lat || eq.location_properties?.epiCenter?.lat || 0,
                    tsunami: false,
                    url:    null
                }));
            }
        },

        emsc: {
            name: 'EMSC',
            flag: '🇪🇺',
            region: 'Euro-Med',
            feeds: {
                hour:  'https://www.seismicportal.eu/fdsnws/event/1/query?limit=80&format=json&minmag=2',
                day:   'https://www.seismicportal.eu/fdsnws/event/1/query?limit=150&format=json&minmag=2',
                week:  'https://www.seismicportal.eu/fdsnws/event/1/query?limit=300&format=json&minmag=2',
                month: 'https://www.seismicportal.eu/fdsnws/event/1/query?limit=500&format=json&minmag=2'
            },
            parse: (data) => {
                if (!data.features) return [];
                return data.features.map(f => {
                    const p = f.properties;
                    return {
                        id:     'emsc-' + (f.id || p.source_id || Math.random().toString(36).slice(2)),
                        source: 'emsc',
                        mag:    p.mag,
                        place:  p.flynn_region || p.region || 'Euro-Mediterranean',
                        time:   new Date(p.time).getTime(),
                        depth:  p.depth || 0,
                        lon:    p.lon,
                        lat:    p.lat,
                        tsunami: false,
                        url:    p.unid ? 'https://www.seismicportal.eu/eventdetails.html?unid=' + p.unid : null
                    };
                });
            }
        },

        geonet: {
            name: 'GeoNet',
            flag: '🇳🇿',
            region: 'New Zealand',
            feeds: {
                hour:  'https://api.geonet.org.nz/quake?MMI=1',
                day:   'https://api.geonet.org.nz/quake?MMI=1',
                week:  'https://api.geonet.org.nz/quake?MMI=0',
                month: 'https://api.geonet.org.nz/quake?MMI=0'
            },
            parse: (data) => {
                if (!data.features) return [];
                return data.features.map(f => {
                    const p = f.properties;
                    const c = f.geometry?.coordinates || [0, 0, 0];
                    return {
                        id:     'geonet-' + (p.publicID || Math.random().toString(36).slice(2)),
                        source: 'geonet',
                        mag:    p.magnitude,
                        place:  p.locality || 'New Zealand Region',
                        time:   new Date(p.time).getTime(),
                        depth:  p.depth || c[2] || 0,
                        lon:    c[0],
                        lat:    c[1],
                        tsunami: false,
                        url:    'https://www.geonet.org.nz/earthquake/' + p.publicID
                    };
                });
            }
        },

        p2pquake: {
            name: 'JMA (via P2P)',
            flag: '🇯🇵',
            region: 'Japan',
            feeds: {
                hour:  'https://api.p2pquake.net/v2/history?codes=551&limit=20',
                day:   'https://api.p2pquake.net/v2/history?codes=551&limit=50',
                week:  'https://api.p2pquake.net/v2/history?codes=551&limit=100',
                month: 'https://api.p2pquake.net/v2/history?codes=551&limit=100'
            },
            parse: (data) => {
                if (!Array.isArray(data)) return [];
                return data
                    .filter(item => item.earthquake && item.earthquake.hypocenter)
                    .map(item => {
                        const h = item.earthquake.hypocenter;
                        const lat = h.latitude;
                        const lon = h.longitude;
                        if (lat == null || lon == null) return null;
                        const depthStr = (h.depth || '0km').toString().replace(/km/i, '');
                        return {
                            id:     'jma-' + (item.id || Math.random().toString(36).slice(2)),
                            source: 'p2pquake',
                            mag:    h.magnitude || 0,
                            place:  h.name || 'Japan Region',
                            time:   new Date(item.earthquake.time?.replace(/\//g, '-') || item.time?.replace(/\//g, '-')).getTime(),
                            depth:  parseFloat(depthStr) || 0,
                            lon:    lon,
                            lat:    lat,
                            tsunami: false,
                            url:    null
                        };
                    })
                    .filter(Boolean);
            }
        },
        ingv: {
            name: 'INGV (Italy)',
            flag: '🇮🇹',
            region: 'Italy & Med',
            feeds: {
                hour:  'https://webservices.ingv.it/fdsnws/event/1/query?format=geojson&limit=100&minmag=1.0',
                day:   'https://webservices.ingv.it/fdsnws/event/1/query?format=geojson&limit=300&minmag=1.5',
                week:  'https://webservices.ingv.it/fdsnws/event/1/query?format=geojson&limit=500&minmag=2.0',
                month: 'https://webservices.ingv.it/fdsnws/event/1/query?format=geojson&limit=1000&minmag=2.5'
            },
            parse: (data) => {
                if (!data.features) return [];
                return data.features.map(f => ({
                    id: f.id,
                    mag: f.properties.mag,
                    place: f.properties.place,
                    time: f.properties.time,
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0],
                    depth: f.geometry.coordinates[2],
                    source: 'ingv',
                    url: `http://terremoti.ingv.it/event/${f.id}`
                }));
            }
        }
    };

    const WORLD_TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
    const POLL_INTERVAL = 60_000;

    // ── Application State ──────────────────────────────────────────
    const state = {
        timeframe: 'day',
        customStart: null,
        customEnd: null,
        minMagnitude: 2.5,
        searchQuery: '',
        allQuakes: [],
        filteredQuakes: [],
        selectedEvent: null,
        audioEnabled: false,
        pollTimer: null,
        lastEventIds: new Set(),
        globe: null,
        sourceStatus: {}  // { sourceKey: { count, status: 'ok'|'error', lastUpdate } }
    };

    // ── DOM References ─────────────────────────────────────────────
    const dom = {
        timeframeBtns:   document.querySelectorAll('#timeframe-selector .tab-btn'),
        customDateFilter:document.getElementById('custom-date-filter'),
        dateStart:       document.getElementById('date-start'),
        dateEnd:         document.getElementById('date-end'),
        magSlider:       document.getElementById('mag-slider'),
        magDisplay:      document.getElementById('mag-display'),
        searchInput:     document.getElementById('country-search'),
        searchClear:     document.getElementById('search-clear'),
        feedList:        document.getElementById('earthquake-list'),
        feedSubtitle:    document.getElementById('feed-subtitle'),
        statTotal:       document.getElementById('stat-total'),
        statMax:         document.getElementById('stat-max'),
        magChart:        document.getElementById('magnitude-chart'),
        sourcesList:     document.getElementById('sources-list'),
        sourceCount:     document.getElementById('source-count'),
        detailsDrawer:   document.getElementById('details-drawer'),
        detailsClose:    document.getElementById('details-close'),
        detailMagBadge:  document.getElementById('detail-mag-badge'),
        detailPlace:     document.getElementById('detail-place'),
        detailTime:      document.getElementById('detail-time'),
        detailDepth:     document.getElementById('detail-depth'),
        detailCoords:    document.getElementById('detail-coords'),
        detailTsunami:   document.getElementById('detail-tsunami'),
        btnFocusMap:     document.getElementById('btn-focus-map'),
        btnRotate:       document.getElementById('btn-rotate'),
        btnSound:        document.getElementById('btn-sound'),
        soundIconOn:     document.getElementById('sound-icon-on'),
        soundIconOff:    document.getElementById('sound-icon-off')
    };

    // ── Initialization ─────────────────────────────────────────────
    async function init() {
        setupCanvasSize();
        state.globe = new SeismicGlobe('globe-canvas');
        bindUIEvents();

        const [topoData, flagsData] = await Promise.all([
            fetch(WORLD_TOPO_URL).then(r => r.json()),
            fetch('https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/index.json').then(r => r.json()),
            fetchAllSources()
        ]);

        const geojson = topojson.feature(topoData, topoData.objects.countries);
        state.globe.init(geojson);
        
        // Build flag map
        const flagMap = {};
        flagsData.forEach(d => flagMap[d.name] = d.emoji);
        state.globe.flagMap = flagMap;
        
        applyFilters();

        state.pollTimer = setInterval(fetchAllSources, POLL_INTERVAL);
        window.addEventListener('resize', debounce(setupCanvasSize, 200));
    }

    // ── Canvas Sizing ──────────────────────────────────────────────
    function setupCanvasSize() {
        const canvas = document.getElementById('globe-canvas');
        const wrapper = canvas.parentElement;
        const size = Math.min(wrapper.clientWidth, wrapper.clientHeight);

        canvas.width = size * window.devicePixelRatio;
        canvas.height = size * window.devicePixelRatio;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        if (state.globe) {
            const ctx = state.globe.ctx;
            ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
            state.globe.setBaseScale(size * 0.44);
            state.globe.projection.translate([size / 2, size / 2]);
        }
    }

    // ── Multi-Source Parallel Fetching ──────────────────────────────
    async function fetchAllSources() {
        const sourceKeys = Object.keys(DATA_SOURCES);
        const results = await Promise.allSettled(
            sourceKeys.map(key => fetchSingleSource(key))
        );

        // Merge all results, deduplicating by proximity (same time ± 2s, same coords ± 0.1°)
        let merged = [];
        const seen = new Set();

        results.forEach((result, i) => {
            const key = sourceKeys[i];
            if (result.status === 'fulfilled' && result.value) {
                const quakes = result.value;
                state.sourceStatus[key] = { count: quakes.length, status: 'ok', lastUpdate: Date.now() };
                quakes.forEach(eq => {
                    // Rough dedup key: rounded coords + rounded time to 5s
                    const dedupKey = `${eq.lat.toFixed(1)}_${eq.lon.toFixed(1)}_${Math.round(eq.time / 5000)}`;
                    if (!seen.has(dedupKey)) {
                        seen.add(dedupKey);
                        merged.push(eq);
                    }
                });
            } else {
                state.sourceStatus[key] = { count: 0, status: 'error', lastUpdate: Date.now() };
            }
        });

        // Detect new events for ripple triggers
        const currentIds = new Set(merged.map(eq => eq.id));
        if (state.lastEventIds.size > 0) {
            merged.forEach(eq => {
                if (!state.lastEventIds.has(eq.id)) {
                    state.globe.triggerRipple([eq.lon, eq.lat], eq.mag);
                    if (state.audioEnabled && eq.mag >= 4.0) playSeismicChime(eq.mag);
                }
            });
        }
        state.lastEventIds = currentIds;

        // Time-filter for 'hour' timeframe (APIs may return more data)
        const now = Date.now();
        if (state.timeframe === 'hour') {
            merged = merged.filter(eq => (now - eq.time) <= 3600_000);
        }

        state.allQuakes = merged;
        applyFilters();
        renderSourceIndicators();
        updateFeedSubtitle();
    }

    async function fetchSingleSource(key) {
        const src = DATA_SOURCES[key];
        let url = src.feeds[state.timeframe] || src.feeds.day;
        
        if (state.timeframe === 'custom' && state.customStart && state.customEnd) {
            if (key === 'usgs') {
                url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${state.customStart}&endtime=${state.customEnd}&minmagnitude=2.5`;
            } else if (key === 'kandilli') {
                url = `https://api.orhanaydogdu.com.tr/deprem/kandilli/archive?date=${state.customStart}&date_end=${state.customEnd}&limit=100`;
            } else if (key === 'emsc') {
                url = `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minmag=2.5&starttime=${state.customStart}&endtime=${state.customEnd}&limit=500`;
            } else if (key === 'ingv') {
                url = `https://webservices.ingv.it/fdsnws/event/1/query?format=geojson&starttime=${state.customStart}&endtime=${state.customEnd}&limit=1000&minmag=2.0`;
            } else {
                url = src.feeds.month;
            }
        }
        
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return src.parse(data);
        } catch (err) {
            console.warn(`[${src.name}] Fetch failed:`, err.message);
            return null;
        }
    }

    // ── Source Status Indicators ────────────────────────────────────
    function renderSourceIndicators() {
        const keys = Object.keys(DATA_SOURCES);
        let activeCount = 0;

        dom.sourcesList.innerHTML = keys.map(key => {
            const src = DATA_SOURCES[key];
            const status = state.sourceStatus[key] || { count: 0, status: 'error' };
            if (status.status === 'ok') activeCount++;

            const dotClass = status.status === 'ok' ? 'ok' : 'error';
            const countText = status.status === 'ok' ? status.count : '—';

            return `
                <div class="source-pill">
                    <span class="source-dot ${dotClass}"></span>
                    <span class="source-flag">${src.flag}</span>
                    <span class="source-name">${src.name}</span>
                    <span class="source-count">${countText}</span>
                </div>`;
        }).join('');

        dom.sourceCount.textContent = activeCount + ' active';
    }

    // ── Filtering Pipeline ─────────────────────────────────────────
    function applyFilters() {
        let list = state.allQuakes;

        // 1. Time filter (Strictly enforce timeframe locally for all APIs)
        const now = Date.now();
        if (state.timeframe === 'hour') {
            list = list.filter(eq => (now - eq.time) <= 3600000);
        } else if (state.timeframe === 'day') {
            list = list.filter(eq => (now - eq.time) <= 86400000);
        } else if (state.timeframe === 'week') {
            list = list.filter(eq => (now - eq.time) <= 604800000);
        } else if (state.timeframe === 'month') {
            list = list.filter(eq => (now - eq.time) <= 2592000000);
        } else if (state.timeframe === 'custom' && state.customStart && state.customEnd) {
            const start = new Date(state.customStart).getTime();
            const end = new Date(state.customEnd).getTime() + 86400000; // Add 24h to include end day fully
            list = list.filter(eq => eq.time >= start && eq.time < end);
        }

        // 2. Magnitude filter
        list = list.filter(eq => eq.mag >= state.minMagnitude);

        // 3. Text search filter
        if (state.searchQuery.length > 0) {
            const q = state.searchQuery.toLowerCase();
            list = list.filter(eq => (eq.place || '').toLowerCase().includes(q));
        }

        // Sort by time descending
        list.sort((a, b) => b.time - a.time);
        state.filteredQuakes = list;

        // Push downstream — convert to globe-compatible format
        state.globe.updateEarthquakes(list.map(eq => ({
            id: eq.id,
            geometry: { coordinates: [eq.lon, eq.lat, eq.depth] },
            properties: { mag: eq.mag, place: eq.place, time: eq.time }
        })));

        renderTimeline(list);
        updateStats(list);
        updateMagnitudeChart(list);
    }

    // ── Timeline Feed Renderer ─────────────────────────────────────
    function renderTimeline(quakes) {
        dom.feedList.innerHTML = '';

        if (quakes.length === 0) {
            dom.feedList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 15s1.5 2 4 2 4-2 4-2"/>
                        <line x1="9" y1="9" x2="9.01" y2="9"/>
                        <line x1="15" y1="9" x2="15.01" y2="9"/>
                    </svg>
                    <span>No seismic events match filters.</span>
                </div>`;
            return;
        }

        const frag = document.createDocumentFragment();
        quakes.forEach(eq => frag.appendChild(createTimelineCard(eq)));
        dom.feedList.appendChild(frag);
    }

    function createTimelineCard(eq) {
        const card = document.createElement('div');
        card.className = 'timeline-card glass-sub';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        let badgeClass = 'badge-low';
        if (eq.mag >= 7.0) badgeClass = 'badge-critical';
        else if (eq.mag >= 6.0) badgeClass = 'badge-high';
        else if (eq.mag >= 4.0) badgeClass = 'badge-med';

        const srcMeta = DATA_SOURCES[eq.source];
        const flag = srcMeta ? srcMeta.flag : '';

        card.innerHTML = `
            <div class="badge-magnitude ${badgeClass}">${eq.mag.toFixed(1)}</div>
            <div class="card-content">
                <span class="card-location">${flag} ${escapeHTML(eq.place)}</span>
                <div class="card-time-group">
                    <span class="card-time">${formatRelativeTime(new Date(eq.time))}</span>
                    <span class="card-depth">${eq.depth.toFixed(1)} km deep</span>
                </div>
            </div>`;

        card.addEventListener('click', () => selectEvent(eq));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectEvent(eq); }
        });
        return card;
    }

    // ── Event Selection & Details Drawer ───────────────────────────
    function selectEvent(eq) {
        state.selectedEvent = eq;
        const time = new Date(eq.time);

        dom.detailMagBadge.textContent = eq.mag.toFixed(1);

        let bgColor = 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
        if (eq.mag >= 7.0) bgColor = 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)';
        else if (eq.mag >= 6.0) bgColor = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
        else if (eq.mag >= 4.0) bgColor = 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)';
        dom.detailMagBadge.style.background = bgColor;
        dom.detailMagBadge.style.color = '#fff';

        const srcMeta = DATA_SOURCES[eq.source];
        const srcLabel = srcMeta ? ` · ${srcMeta.flag} ${srcMeta.name}` : '';
        dom.detailPlace.textContent = eq.place + srcLabel;
        dom.detailTime.textContent = time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
        dom.detailDepth.textContent = eq.depth.toFixed(1) + ' km';
        dom.detailCoords.textContent =
            Math.abs(eq.lat).toFixed(3) + '° ' + (eq.lat >= 0 ? 'N' : 'S') + ', ' +
            Math.abs(eq.lon).toFixed(3) + '° ' + (eq.lon >= 0 ? 'E' : 'W');
        dom.detailTsunami.textContent = eq.tsunami ? '⚠ ACTIVE' : 'None';
        dom.detailTsunami.style.color = eq.tsunami ? '#ef4444' : '#64748b';

        dom.detailsDrawer.classList.remove('hide');
        requestAnimationFrame(() => dom.detailsDrawer.classList.add('show'));

        document.querySelectorAll('.timeline-card').forEach(el => el.classList.remove('selected'));

        state.globe.smoothRotateTo([eq.lon, eq.lat]);
        state.globe.triggerRipple([eq.lon, eq.lat], eq.mag);
        state.globe.setSelectedQuake(eq.id);
        
        state.globe.autoRotate = false;
        document.getElementById('btn-rotate').classList.remove('active');
    }

    function closeDetails() {
        dom.detailsDrawer.classList.remove('show');
        setTimeout(() => dom.detailsDrawer.classList.add('hide'), 500);
        state.selectedEvent = null;
        if (state.globe) {
            state.globe.setSelectedQuake(null);
            state.globe.autoRotate = true;
            document.getElementById('btn-rotate').classList.add('active');
        }
    }

    // ── Statistics ─────────────────────────────────────────────────
    function updateStats(quakes) {
        animateCounter(dom.statTotal, quakes.length, 0);
        const maxMag = quakes.length > 0 ? Math.max(...quakes.map(eq => eq.mag)) : 0;
        animateCounter(dom.statMax, maxMag, 1);
    }

    function animateCounter(el, target, decimals) {
        const current = parseFloat(el.textContent) || 0;
        const diff = target - current;
        const steps = 30;
        let step = 0;
        function tick() {
            step++;
            const progress = easeOutCubic(step / steps);
            el.textContent = (current + diff * progress).toFixed(decimals);
            if (step < steps) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    // ── Magnitude Bar Chart ────────────────────────────────────────
    function updateMagnitudeChart(quakes) {
        const buckets = [
            { label: '2-3', min: 2, max: 3, count: 0, cls: 'bar-low' },
            { label: '3-4', min: 3, max: 4, count: 0, cls: 'bar-low' },
            { label: '4-5', min: 4, max: 5, count: 0, cls: 'bar-med' },
            { label: '5-6', min: 5, max: 6, count: 0, cls: 'bar-med' },
            { label: '6-7', min: 6, max: 7, count: 0, cls: 'bar-high' },
            { label: '7+',  min: 7, max: 11, count: 0, cls: 'bar-high' }
        ];
        quakes.forEach(eq => {
            for (const b of buckets) { if (eq.mag >= b.min && eq.mag < b.max) { b.count++; break; } }
        });
        const maxCount = Math.max(1, ...buckets.map(b => b.count));
        dom.magChart.innerHTML = buckets.map(b => {
            const pct = (b.count / maxCount * 100).toFixed(1);
            return `
                <div class="bar-wrapper">
                    <div class="chart-bar-container">
                        <div class="chart-bar ${b.cls}" style="height: ${pct}%"></div>
                    </div>
                    <span class="chart-bar-label">${b.label}</span>
                </div>`;
        }).join('');
    }


    // ── Application State ──────────────────────────────────────────────
    function updateFeedSubtitle() {
        const activeKeys = Object.keys(state.sourceStatus).filter(k => state.sourceStatus[k].status === 'ok');
        const names = activeKeys.map(k => DATA_SOURCES[k].name).join(' · ');
        dom.feedSubtitle.textContent = (names || 'Connecting...') + ' · ' + formatRelativeTime(new Date());
    }

    // ── Web Audio Seismic Chime ────────────────────────────────────
    let audioCtx = null;
    function playSeismicChime(mag) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const freq = 40 + (mag - 4) * 15;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.4, audioCtx.currentTime + 1.5);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 2);
        } catch (e) { /* silently ignore */ }
    }

    // ── UI Event Bindings ──────────────────────────────────────────
    function bindUIEvents() {
        dom.timeframeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                dom.timeframeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.timeframe = btn.dataset.timeframe;
                state.lastEventIds.clear();
                
                if (state.timeframe === 'custom') {
                    dom.customDateFilter.classList.remove('hide');
                    // Don't fetch until dates are selected
                    if (!state.customStart || !state.customEnd) return;
                } else {
                    dom.customDateFilter.classList.add('hide');
                }
                
                showFeedLoading();
                fetchAllSources();
            });
        });

        // Date Pickers
        const onDateChange = () => {
            state.customStart = dom.dateStart.value;
            state.customEnd = dom.dateEnd.value;
            if (state.customStart && state.customEnd) {
                state.lastEventIds.clear(); // Fix ripple explosion
                showFeedLoading();
                fetchAllSources();
            }
        };
        dom.dateStart.addEventListener('change', onDateChange);
        dom.dateEnd.addEventListener('change', onDateChange);

        dom.magSlider.addEventListener('input', () => {
            const val = parseFloat(dom.magSlider.value);
            state.minMagnitude = val;
            dom.magDisplay.textContent = val.toFixed(1) + ' M';
            applyFilters();
        });

        dom.searchInput.addEventListener('input', debounce(() => {
            state.searchQuery = dom.searchInput.value.trim();
            dom.searchClear.style.display = state.searchQuery.length ? 'block' : 'none';
            applyFilters();
        }, 250));

        dom.searchClear.addEventListener('click', () => {
            dom.searchInput.value = '';
            state.searchQuery = '';
            dom.searchClear.style.display = 'none';
            applyFilters();
        });

        dom.detailsClose.addEventListener('click', closeDetails);

        dom.btnFocusMap.addEventListener('click', () => {
            if (state.selectedEvent) {
                const eq = state.selectedEvent;
                state.globe.smoothRotateTo([eq.lon, eq.lat]);
                state.globe.triggerRipple([eq.lon, eq.lat], eq.mag);
                state.globe.setSelectedQuake(eq.id);
            }
        });

        dom.btnRotate.addEventListener('click', () => {
            state.globe.autoRotate = !state.globe.autoRotate;
            dom.btnRotate.classList.toggle('active', state.globe.autoRotate);
        });

        dom.btnSound.addEventListener('click', () => {
            state.audioEnabled = !state.audioEnabled;
            dom.btnSound.classList.toggle('active', state.audioEnabled);
            dom.soundIconOn.classList.toggle('hide', !state.audioEnabled);
            dom.soundIconOff.classList.toggle('hide', state.audioEnabled);
            if (state.audioEnabled && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        });

        window.addEventListener('countrySelected', (e) => {
            const feature = e.detail;
            if (feature?.properties?.name) {
                dom.searchInput.value = feature.properties.name;
                state.searchQuery = feature.properties.name.toLowerCase();
                dom.searchClear.style.display = 'block';
                applyFilters();
            } else {
                // Clicked empty ocean: clear country filter and forget selected earthquake
                if (state.searchQuery.length > 0) {
                    dom.searchInput.value = '';
                    state.searchQuery = '';
                    dom.searchClear.style.display = 'none';
                    applyFilters();
                }
                closeDetails();
            }
        });
    }

    // ── Loading State ──────────────────────────────────────────────
    function showFeedLoading() {
        dom.feedList.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Syncing multi-source seismic feeds...</p>
            </div>`;
    }

    // ── Utilities ──────────────────────────────────────────────────
    function formatRelativeTime(date) {
        const diffMs = Date.now() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHr = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHr / 24);
        if (diffSec < 60) return 'just now';
        if (diffMin < 60) return diffMin + 'm ago';
        if (diffHr < 24) return diffHr + 'h ago';
        if (diffDay < 7) return diffDay + 'd ago';
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function debounce(fn, ms) {
        let timer;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn.apply(null, args), ms); };
    }

    // ── Launch ─────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

})();
