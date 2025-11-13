const API_URL = "https://script.google.com/macros/s/AKfycbzYocfqO5ocGt05Zqq9TITwjDVhL_yGQ5feFBGcjVIbP7puAb6drbVOh3jvkFueJfBscw/exec"; // <-- replace with your Apps Script web app URL

// Initialize map
const map = L.map('map', {
    maxBounds: [[-90, 200], [120, -200]],
    maxBoundsViscosity: 1.0
}).setView([20, 0], 2);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    minZoom: 3,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
}).addTo(map);
map.attributionControl.addAttribution('<a href="https://www.vecteezy.com/free-png/flower">Flower PNGs by Vecteezy</a>')

function getOpacity(timestamp) {
    const delta_time = new Date() - timestamp;
    console.log(delta_time);
    return 1 - delta_time / 3628000000  //50% in 3 weeks
}

function getIcon(timestamp, icon) {
    return L.divIcon({
        html: `<img
        style="transform: translate(-0%, -25%); opacity: ${getOpacity(timestamp)};"
        height=28px
        src="images/${icon}.small.png" 
                    alt="memory"/>`,
        iconSize: [24, 24],
        className: ''
    });
}

// Create HTML for a marker popup including a "Water" button
function makePopupHtml(title, body, uuid) {
    const safeTitle = escapeHtml(title || '');
    const safeBody = escapeHtml(body || '');
    const id = escapeHtml(String(uuid || ''));
    return `
        <div class="memory-popup">
            <b>${safeTitle}</b>
            <div style="font-size:12px;color:#666;margin-bottom:6px;">${id ? new Date(id).toLocaleString() : ''}</div>
            <p>${safeBody}</p>
            <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
                <button class="water-btn" data-uuid="${id}">Water 🌧️</button>
                <span class="water-status" style="font-size:12px;color:#666;margin-left:6px;"></span>
            </div>
        </div>
    `;
}

// Send a "water" update to the server by POSTing the uuid. Server will update lastupdated.
async function sendWater(uuid) {
    const payload = { uuid };
    const formBody = new URLSearchParams();
    Object.entries(payload).forEach(([k, v]) => formBody.append(k, String(v || '')));
    const res = await fetch(API_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: formBody.toString()
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
}

// When any popup opens, wire the Water button to call sendWater
map.on('popupopen', function (e) {
    try {
        const popupEl = e.popup.getElement();
        if (!popupEl) return;
        const btn = popupEl.querySelector('.water-btn');
        const statusSpan = popupEl.querySelector('.water-status');
        if (!btn) return;
        // avoid attaching multiple listeners
        if (btn.__wired) return;
        btn.__wired = true;
        btn.addEventListener('click', async () => {
            const uuid = btn.dataset.uuid;
            if (!uuid) return;
            btn.disabled = true;
            if (statusSpan) statusSpan.textContent = 'Updating...';
            try {
                const result = await sendWater(uuid);
                if (result && result.success) {
                    if (statusSpan) statusSpan.textContent = 'Watered ✓';
                    // Update marker icon to full opacity now that it was watered
                    try {
                        const marker = e.popup && e.popup._source ? e.popup._source : null;
                        if (marker && marker.memoryIcon) {
                            // set icon with current time -> opacity = 1
                            marker.setIcon(getIcon(new Date(), marker.memoryIcon));
                            marker.memoryLastWatered = new Date();
                        }
                    } catch (mErr) { console.error('Failed to update marker after water', mErr); }
                    // Optionally refresh popup timestamp display
                    const tsEl = popupEl.querySelector('.memory-popup div');
                    if (tsEl) tsEl.textContent = new Date().toLocaleString();
                } else {
                    if (statusSpan) statusSpan.textContent = 'Failed';
                    console.warn('Water failed', result);
                }
            } catch (err) {
                console.error('Water request failed', err);
                if (statusSpan) statusSpan.textContent = 'Network error';
            } finally {
                btn.disabled = false;
                setTimeout(() => { if (statusSpan) statusSpan.textContent = ''; }, 2000);
            }
        });
    } catch (err) {
        console.error('popupopen handler error', err);
    }
});

// Load existing memories from sheet
async function loadMemories() {
    try {
        const res = await fetch(API_URL, {
            redirect: "follow",
            method: 'GET',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            }
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();

        // Check if data is an array
        if (!Array.isArray(data)) {
            console.warn("API returned non-array data:", data);
            return;
        }

        // data is array of objects with keys: timestamp, lat, lng, title, body, icon, opacity, lastwatered
        data.forEach(mem => {
            const lat = parseFloat(mem.lat);
            const lng = parseFloat(mem.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            const created = mem.timestamp ? new Date(mem.timestamp).toLocaleString() : '';
            const popupHtml = makePopupHtml(mem.title, mem.body, mem.timestamp);
            const marker = L.marker([lat, lng], { icon: getIcon(new Date(mem.lastwatered || mem.timestamp), mem.icon) }).addTo(map);
            // store metadata on marker so popup handlers can access it
            marker.memoryIcon = mem.icon;
            marker.memoryUuid = mem.timestamp;
            marker.memoryLastWatered = mem.lastwatered ? new Date(mem.lastwatered) : (mem.timestamp ? new Date(mem.timestamp) : new Date());
            marker.bindPopup(popupHtml);
        });
    } catch (err) {
        console.error("Failed to load memories:", err);
        if (err.name === 'TypeError' && err.message.includes('CORS')) {
            console.error("CORS error: Make sure your Google Apps Script is deployed as a web app with 'Anyone' access");
        }
    }
}

// Escape HTML to prevent injection
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
}


// Click behavior: open a small popup form with coords prefilled
map.on('click', function (e) {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    const formHtml = `
        <div class="popup-form">
            <input id="m-title" placeholder="Title (short)" maxlength="100" />
            <div class="image-dropdown">
                <div class="image-select" id="image-select">
                    <img id="image-select-preview" src="images/1.large.png" alt="selected" />
                    <span id="image-select-label">Choose image</span>
                </div>
                <div class="image-options" id="image-options">
                    <div class="image-option" data-value="1"><img src="images/1.large.png" alt="1" /></div>
                    <div class="image-option" data-value="2"><img src="images/2.large.png" alt="2" /></div>
                    <div class="image-option" data-value="3"><img src="images/3.large.png" alt="3" /></div>
                    <div class="image-option" data-value="4"><img src="images/4.large.png" alt="4" /></div>
                    <div class="image-option" data-value="5"><img src="images/5.large.png" alt="5" /></div>
                    <div class="image-option" data-value="6"><img src="images/6.large.png" alt="6" /></div>
                </div>
                <input type="hidden" id="m-icon" value="1.png" />
            </div>
            <textarea id="m-body" placeholder="Write your memory (a sentence or two)" rows="3" maxlength="500"></textarea>
            <div style="display:flex; gap:6px;">
                <input id="m-lat" value="${lat}" style="width:100px;" />
                <input id="m-lng" value="${lng}" style="width:100px;" />
            </div>
            <div style="display:flex; gap:6px;">
                <button id="m-submit">Save memory</button>
                <button id="m-cancel">Cancel</button>
            </div>
            <div id="m-status" style="font-size:12px;color:#333;"></div>
        </div>
        `;
    const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(formHtml)
        .openOn(map);

    setTimeout(() => {
        const btn = document.getElementById('m-submit');
        const cancel = document.getElementById('m-cancel');
        const status = document.getElementById('m-status');
        // wire image dropdown behavior inside popup
        try {
            const sel = document.getElementById('image-select');
            const opts = document.getElementById('image-options');
            const preview = document.getElementById('image-select-preview');
            const hidden = document.getElementById('m-icon');
            if (sel && opts && hidden) {
                sel.addEventListener('click', (ev) => { ev.stopPropagation(); opts.style.display = opts.style.display === 'block' ? 'none' : 'block'; });
                opts.querySelectorAll('.image-option').forEach(o => {
                    o.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        opts.querySelectorAll('.image-option').forEach(x => x.classList.remove('selected'));
                        o.classList.add('selected');
                        const v = o.dataset.value;
                        hidden.value = v;
                        if (preview) preview.src = "images/" + v + ".large.png";
                        opts.style.display = 'none';
                    });
                });
                // close options if clicking outside popup
                document.addEventListener('click', function docClose(e) { if (!opts.contains(e.target) && !sel.contains(e.target)) { opts.style.display = 'none'; document.removeEventListener('click', docClose); } });
            }
        } catch (wireErr) { console.error('image dropdown wiring failed', wireErr); }

        btn.onclick = async () => {
            const title = document.getElementById('m-title').value.trim();
            const body = document.getElementById('m-body').value.trim();
            const latVal = document.getElementById('m-lat').value;
            const lngVal = document.getElementById('m-lng').value;
            const icon = document.getElementById("m-icon").value;
            if (!latVal || !lngVal) { status.textContent = 'Coordinates missing.'; return; }
            // POST to API
            status.textContent = 'Saving...';
            try {
                const payload = { lat: latVal, lng: lngVal, title, body, icon };
                // Use form-encoded body to avoid CORS preflight (Apps Script doesn't handle OPTIONS)
                const formBody = new URLSearchParams();
                Object.entries(payload).forEach(([k, v]) => formBody.append(k, String(v || '')));

                const res = await fetch(API_URL, {
                    method: 'POST',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                    },
                    body: formBody.toString()
                });

                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }

                const result = await res.json();
                if (result && result.success) {
                    status.textContent = 'Saved!';
                    // add marker immediately
                    // use server timestamp if present
                    const serverTs = result.lastwatered || new Date().toISOString();
                    const popupHtml = makePopupHtml(title, body, serverTs);
                    const marker = L.marker([parseFloat(latVal), parseFloat(lngVal)], { icon: getIcon(new Date(serverTs), icon) }).addTo(map);
                    marker.memoryIcon = icon;
                    marker.memoryUuid = serverTs;
                    marker.memoryLastWatered = serverTs ? new Date(serverTs) : new Date();
                    marker.bindPopup(popupHtml);

                    setTimeout(() => map.closePopup(), 800);
                } else {
                    status.textContent = 'Save failed: ' + (result.error || JSON.stringify(result));
                }
            } catch (err) {
                console.error(err);
                if (err.name === 'TypeError' && err.message.includes('CORS')) {
                    status.textContent = 'CORS error - check console for details';
                } else {
                    status.textContent = 'Network error (see console).';
                }
            }
        };
        cancel.onclick = () => map.closePopup();
    }, 50);
});

// initial load
loadMemories();