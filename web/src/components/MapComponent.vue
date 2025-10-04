<template>
  <div id="map-container" class="map-container z-10"></div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import L from 'leaflet';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
let map = null;
let socket = null;
const vehicleMarkers = {};

const tramSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M4 16.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10.5a3.5 3.5 0 0 1-3.5 3.5h-1a3.5 3.5 0 0 1-3.5-3.5V16h-1v.5a3.5 3.5 0 0 1-3.5 3.5h-1A3.5 3.5 0 0 1 4 16.5zM8 16a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM6 6v7h12V6H6z"/></svg>`;
const busSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M18 4H6c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM6 6h12v7H6V6zm0 9c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`;

function createVehicleIcon(properties) {
  const { lineNumber, product, delay } = properties;
  const isTram = product === 'tram';
  const iconTypeSVG = isTram ? tramSVG : busSVG;

  let delayHtml = '';
  if (delay !== null && Math.abs(delay) > 60) {
    const delayMinutes = Math.round(delay / 60);
    const delayColor = delay > 0 ? 'bg-red-500' : 'bg-blue-500';
    const sign = delay > 0 ? '+' : '';
    delayHtml = `<div class="absolute -bottom-2.5 text-xs font-bold text-white px-1.5 py-0.5 rounded-full shadow-md whitespace-nowrap ${delayColor}">${sign}${delayMinutes}</div>`;
  }

  const iconHtml = `
    <div class="relative flex flex-col items-center transition-transform duration-300 ease-in-out">
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shadow-lg border-2 border-white relative bg-brand-green-700">
            ${iconTypeSVG}
        </div>
        <div class="absolute -top-1 -right-2 bg-white text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-brand-green-700">
            ${lineNumber || '?'}
        </div>
        ${delayHtml}
    </div>`;

  return L.divIcon({
    html: iconHtml,
    className: '', // important to be empty
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });
}

function createPopupContent(properties) {
  const { lineNumber, product, direction, delay } = properties;
  const isTram = product === 'tram';
  const headerColor = 'bg-brand-green-700';

  let delayText;
  if (delay === null || Math.abs(delay) <= 60) {
    delayText = `<span class="text-gray-600 font-medium">${t('onTime')}</span>`;
  } else {
    const delayMinutes = Math.round(Math.abs(delay) / 60);
    if (delay > 60) {
      delayText = `<span class="font-bold text-red-600">${t('minutesLate', { count: delayMinutes })}</span>`;
    } else {
      delayText = `<span class="font-bold text-blue-600">${t('minutesEarly', { count: delayMinutes })}</span>`;
    }
  }

  return `
    <div class="w-64 overflow-hidden rounded-lg shadow-lg">
      <div class="${headerColor} p-4 text-white">
        <h3 class="text-xl font-bold leading-6">${isTram ? t('tram') : t('cityBus')} ${lineNumber}</h3>
      </div>
      <div class="border-t border-gray-200 bg-white">
        <dl>
          <div class="bg-gray-50 px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt class="text-sm font-medium text-gray-500">${t('direction')}</dt>
            <dd class="mt-1 text-sm text-gray-900 font-semibold sm:col-span-2 sm:mt-0">${direction}</dd>
          </div>
          <div class="px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt class="text-sm font-medium text-gray-500">Status</dt>
            <dd class="mt-1 text-sm sm:col-span-2 sm:mt-0">${delayText}</dd>
          </div>
        </dl>
      </div>
    </div>`;
}


function updateMarkers(geoJsonData) {
  if (!map) return;
  const receivedTripIds = new Set();

  geoJsonData.features.forEach(vehicle => {
    const { tripId } = vehicle.properties;
    const [lng, lat] = vehicle.geometry.coordinates;
    receivedTripIds.add(tripId);

    const popupContent = createPopupContent(vehicle.properties);
    const icon = createVehicleIcon(vehicle.properties);

    if (vehicleMarkers[tripId]) {
      vehicleMarkers[tripId]
          .setLatLng([lat, lng])
          .setPopupContent(popupContent)
          .setIcon(icon);
    } else {
      const marker = L.marker([lat, lng], { icon }).addTo(map);
      marker.bindPopup(popupContent, { offset: L.point(0, -35), closeButton: true });
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

function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Use nginx reverse proxy path
  socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

  socket.onopen = () => console.log("WebSocket connection established");
  socket.onclose = () => {
    console.log("WebSocket connection closed, attempting to reconnect in 5 seconds...");
    setTimeout(connectWebSocket, 5000);
  };
  socket.onerror = (error) => console.error("WebSocket Error:", error);
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'FeatureCollection') {
        updateMarkers(data);
      }
    } catch (e) {
      console.error('Error parsing WebSocket message:', e);
    }
  };
}


onMounted(() => {
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
  });
  const light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  });

  map = L.map('map-container', {
    layers: [light] // Default layer
  }).setView([47.0707, 15.4395], 14);

  const baseMaps = {
    "Light": light,
    "Standard": osm,
    "Satellite": satellite,
  };

  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

  connectWebSocket();
});

onUnmounted(() => {
  if (socket) {
    socket.close();
  }
  if (map) {
    map.remove();
    map = null;
  }
});
</script>