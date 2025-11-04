const API_URL = "https://script.google.com/macros/s/AKfycbzTJmlE2i-c2JVbJYfjlrMHsvasm1URFfVPYH7NqtXKRapfgLp0JvuoWXu9kapEhlSXtg/exec"; // <-- replace with your Apps Script web app URL

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

// Simple flower icon using emoji inside DivIcon
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
    src="${icon}.small.png" 
                    alt="memory"/>`,
        iconSize: [24, 24],
        className: ''
    });
}


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

        // data is array of objects with keys: timestamp, lat, lng, title, body, icon, opacity
        data.forEach(mem => {
            const lat = parseFloat(mem.lat);
            const lng = parseFloat(mem.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            const marker = L.marker([lat, lng], { icon: getIcon(new Date(mem.timestamp), mem.icon) }).addTo(map);
            const created = mem.timestamp ? new Date(mem.timestamp).toLocaleString() : '';
            marker.bindPopup(`<b>${escapeHtml(mem.title || '')}</b><br /><small style="color:#666">${created}</small><p>${escapeHtml(mem.body || '')}</p>`);
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
                    <img id="image-select-preview" src="1.large.png" alt="selected" />
                    <span id="image-select-label">Choose image</span>
                </div>
                <div class="image-options" id="image-options">
                    <div class="image-option" data-value="1"><img src="1.large.png" alt="1" /></div>
                    <div class="image-option" data-value="2"><img src="2.large.png" alt="2" /></div>
                    <div class="image-option" data-value="3"><img src="3.large.png" alt="3" /></div>
                    <div class="image-option" data-value="4"><img src="4.large.png" alt="4" /></div>
                    <div class="image-option" data-value="5"><img src="5.large.png" alt="5" /></div>
                    <div class="image-option" data-value="6"><img src="6.large.png" alt="6" /></div>
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
                        if (preview) preview.src = v + ".large.png";
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
                    const marker = L.marker([parseFloat(latVal), parseFloat(lngVal)], { icon: getIcon(new Date(), icon) }).addTo(map);
                    marker.bindPopup(`<b>${escapeHtml(title)}</b><p>${escapeHtml(body)}</p>`);

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