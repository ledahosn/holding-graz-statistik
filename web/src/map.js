import L from 'leaflet';

// --- HTML Template for the Map View ---
const mapTemplate = `<div id="map" class="rounded-lg z-0 shadow-lg"></div>`;

const vehicleMarkers = {}; // To store and manage markers by tripId

// --- New SVG Icons ---
const tramSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
  <path d="M4 16.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10.5a3.5 3.5 0 0 1-3.5 3.5h-1a3.5 3.5 0 0 1-3.5-3.5V16h-1v.5a3.5 3.5 0 0 1-3.5 3.5h-1A3.5 3.5 0 0 1 4 16.5zM8 16a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM6 6v7h12V6H6z"/>
</svg>`;

const busSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
  <path d="M18 4H6c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM6 6h12v7H6V6zm0 9c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
</svg>`;


/**
 * Creates an advanced, multi-part icon with a main symbol, line number badge, and permanent delay indicator.
 */
function createVehicleIcon(lineName, delay) {
    const isTram = lineName.toLowerCase().includes('straßenbahn');
    const lineIdentifier = lineName.split(' ').pop();

    const iconTypeSVG = isTram ? tramSVG : busSVG;
    const bgColor = isTram ? 'bg-red-600' : 'bg-blue-600';

    let delayHtml = '';
    if (delay !== null && Math.abs(delay) > 30) { // Only show delay if > 30 seconds
        const delayMinutes = Math.round(delay / 60);
        const delayColor = delay > 0 ? 'bg-red-500' : 'bg-green-500';
        const sign = delay > 0 ? '+' : '';
        delayHtml = `<div class="delay-label ${delayColor}">${sign}${delayMinutes} min</div>`;
    }

    const iconHtml = `
      <div class="vehicle-marker">
        <div class="main-icon ${bgColor}">
          ${iconTypeSVG}
          <div class="line-badge">${lineIdentifier}</div>
        </div>
        ${delayHtml}
      </div>`;

    return L.divIcon({
        html: iconHtml,
        className: '', // Clear default styles
        iconSize: [40, 40],
        iconAnchor: [20, 40],
    });
}

/**
 * Creates a beautifully styled popup content with Tailwind CSS.
 */
function createPopupContent(properties) {
    const { lineName, direction, delay } = properties;
    const isTram = lineName.toLowerCase().includes('straßenbahn');
    const headerColor = isTram ? 'bg-red-600' : 'bg-blue-600';
    const lineIdentifier = lineName.split(' ').pop();

    let delayText = '<span class="text-gray-500">On time</span>';
    if (delay !== null && delay > 30) {
        delayText = `<span class="font-bold text-red-600">${Math.round(delay / 60)} min late</span>`;
    } else if (delay !== null && delay < -30) {
        delayText = `<span class="font-bold text-green-600">${Math.abs(Math.round(delay / 60))} min early</span>`;
    }

    return `
        <div class="w-64 rounded-lg shadow-2xl overflow-hidden transform transition-all duration-300">
            <div class="${headerColor} text-white p-4">
                <h3 class="text-2xl font-bold leading-6">Line ${lineIdentifier}</h3>
                <p class="mt-1 max-w-2xl text-sm text-white opacity-80">${isTram ? 'Tram' : 'City Bus'}</p>
            </div>
            <div class="border-t border-gray-200 bg-white">
                <dl>
                    <div class="bg-gray-50 px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt class="text-sm font-medium text-gray-500">Direction</dt>
                        <dd class="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 font-semibold">${direction}</dd>
                    </div>
                    <div class="px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt class="text-sm font-medium text-gray-500">Status</dt>
                        <dd class="mt-1 text-sm sm:col-span-2 sm:mt-0">${delayText}</dd>
                    </div>
                </dl>
            </div>
        </div>
    `;
}

// (The updateMarkers function and the rest of the file remain the same)
// ...
function updateMarkers(geoJsonData, map) {
    const receivedTripIds = new Set();

    geoJsonData.features.forEach(vehicle => {
        const { tripId, lineName, delay } = vehicle.properties;
        const [lng, lat] = vehicle.geometry.coordinates;
        receivedTripIds.add(tripId);

        const popupContent = createPopupContent(vehicle.properties);

        if (vehicleMarkers[tripId]) {
            vehicleMarkers[tripId]
                .setLatLng([lat, lng])
                .setPopupContent(popupContent)
                .setIcon(createVehicleIcon(lineName, delay));
        } else {
            const marker = L.marker([lat, lng], {
                icon: createVehicleIcon(lineName, delay)
            }).addTo(map);
            marker.bindPopup(popupContent, {
                offset: L.point(0, -25),
                closeButton: true,
                className: 'vehicle-popup'
            });
            vehicleMarkers[tripId] = marker;
        }
    });

    for (const tripId in vehicleMarkers) {
        if (!receivedTripIds.has(tripId)) {
            map.removeLayer(vehicleMarkers[tripId]);
            delete vehicleMarkers[tripId];
        }
    }
}

export function initMap(container) {
    container.innerHTML = mapTemplate;

    // --- BASEMAPS ---
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });
    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    });

    const map = L.map('map', {
        layers: [dark] // Default layer
    }).setView([47.0707, 15.4395], 14); // Zoomed in a little more

    const baseMaps = {
        "Dark Mode": dark,
        "Satellite": satellite,
        "Standard": osm,
    };

    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

    // --- WebSocket Connection ---
    const socket = new WebSocket(`ws://${window.location.hostname}:3001`);

    socket.onopen = () => console.log("WebSocket connection established");
    socket.onclose = () => console.log("WebSocket connection closed, will attempt to reconnect...");
    socket.onerror = (error) => console.error("WebSocket Error:", error);
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'FeatureCollection') {
                updateMarkers(data, map);
            }
        } catch (e) {
            console.error('Error parsing WebSocket message:', e);
        }
    };
}