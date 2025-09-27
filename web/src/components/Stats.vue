<template>
  <div class="p-4 sm:p-6 md:p-8 bg-gray-50 h-full">
    <div class="max-w-7xl mx-auto">
      <div class="bg-white shadow-xl rounded-2xl p-6">
        <h1 class="text-3xl font-bold text-gray-800 mb-2">{{ $t('statisticsTitle') }}</h1>
        <p class="text-gray-500 mb-6">{{ $t('statisticsSubtitle') }}</p>

        <!-- Form Inputs -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <!-- Line Select -->
          <div class="flex flex-col">
            <label for="line-select" class="block text-sm font-medium text-gray-700 mb-1">{{ $t('selectLine') }}</label>
            <select id="line-select" v-model="selectedLine" @change="fetchTrips" class="form-select">
              <option disabled value="">{{ $t('pleaseChoose') }}</option>
              <option v-for="line in lines" :key="line.line_id" :value="line.line_id">
                {{ line.line_name }}
              </option>
            </select>
          </div>

          <!-- Date Select -->
          <div class="flex flex-col">
            <label for="date-select" class="block text-sm font-medium text-gray-700 mb-1">{{ $t('date') }}</label>
            <input type="date" id="date-select" v-model="selectedDate" @change="fetchTrips" class="form-input">
          </div>

          <!-- Trip Select -->
          <div class="flex flex-col">
            <label for="trip-select" class="block text-sm font-medium text-gray-700 mb-1">{{ $t('selectTrip') }}</label>
            <select id="trip-select" v-model="selectedTrip" @change="fetchTripDelays" class="form-select" :disabled="!trips.length">
              <option disabled value="">{{ trips.length ? $t('pleaseChooseTrip') : $t('noTripsFound') }}</option>
              <!-- MODIFIED: Display formatted trip label -->
              <option v-for="trip in trips" :key="trip.trip_id" :value="trip.trip_id">
                {{ formatTripLabel(trip) }}
              </option>
            </select>
          </div>
        </div>

        <!-- Results Display -->
        <div class="mt-8">
          <div v-if="isLoading" class="text-center py-8">
            <p class="text-gray-500">{{ $t('loading') }}</p>
          </div>
          <div v-else-if="error" class="text-center py-8">
            <p class="text-red-500">{{ error }}</p>
          </div>
          <div v-else-if="!selectedTrip" class="text-center py-8">
            <p class="text-gray-500">{{ $t('selectToView') }}</p>
          </div>
          <div v-else-if="tripDelays.length > 0" class="overflow-x-auto">
            <h2 class="text-xl font-semibold text-gray-700 mb-4">{{ $t('delayReport') }}</h2>
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="th-cell">{{ $t('station') }}</th>
                <th scope="col" class="th-cell">{{ $t('plannedArrival') }}</th>
                <th scope="col" class="th-cell">{{ $t('actualArrival') }}</th>
                <th scope="col" class="th-cell">{{ $t('delay') }}</th>
              </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="stop in tripDelays" :key="stop.stop_id">
                <td class="td-cell font-medium text-gray-900">{{ stop.stop_name }}</td>
                <td class="td-cell">{{ formatTime(stop.planned_time) }}</td>
                <td class="td-cell">{{ formatTime(stop.actual_time) }}</td>
                <td :class="['td-cell font-semibold', getDelayColor(stop.arrival_delay_seconds)]">
                  {{ formatDelay(stop.arrival_delay_seconds) }}
                </td>
              </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="text-center py-8">
            <p class="text-gray-500">{{ $t('noDelayData') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const lines = ref([]);
const selectedLine = ref('');
const selectedDate = ref(new Date().toISOString().split('T')[0]);
const trips = ref([]);
const selectedTrip = ref('');
const tripDelays = ref([]);
const isLoading = ref(false);
const error = ref(null);

const API_BASE_URL = 'http://localhost:3001/api';

async function fetchLines() {
  try {
    const response = await fetch(`${API_BASE_URL}/lines`);
    if (!response.ok) throw new Error('Failed to load lines.');
    lines.value = await response.json();
  } catch (err) {
    error.value = err.message;
  }
}

async function fetchTrips() {
  if (!selectedLine.value || !selectedDate.value) return;
  isLoading.value = true;
  error.value = null;
  trips.value = [];
  selectedTrip.value = '';
  tripDelays.value = [];

  try {
    const response = await fetch(`${API_BASE_URL}/trips/line/${selectedLine.value}?date=${selectedDate.value}`);
    if (!response.ok) throw new Error('Failed to load trips for the selected criteria.');
    trips.value = await response.json();
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

async function fetchTripDelays() {
  if (!selectedTrip.value) {
    tripDelays.value = [];
    return
  };
  isLoading.value = true;
  error.value = null;
  tripDelays.value = [];

  try {
    // MODIFIED: Switched to a POST request
    const response = await fetch(`${API_BASE_URL}/trip/delays`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tripId: selectedTrip.value }),
    });
    if (!response.ok) throw new Error('Failed to load delay data for the selected trip.');
    tripDelays.value = await response.json();
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.value = false;
  }
}


// --- Formatting Helpers ---

// MODIFIED: New function to create a user-friendly trip label
function formatTripLabel(trip) {
  const timeMatch = trip.trip_id.match(/#1T#(\d{4})#/);
  if (timeMatch && timeMatch[1]) {
    const time = timeMatch[1];
    const formattedTime = `${time.slice(0, 2)}:${time.slice(2)}`;
    return `${trip.direction} (${formattedTime})`;
  }
  // Fallback if time cannot be parsed
  return `${trip.direction} - ${trip.trip_id.slice(-10)}`;
}


function formatTime(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDelay(seconds) {
  if (seconds === null || seconds === undefined) return 'On Time';
  if (seconds === 0) return 'On Time';
  const minutes = Math.floor(Math.abs(seconds) / 60);
  const sign = seconds > 0 ? '+' : '-';
  return `${sign}${minutes} min`;
}

function getDelayColor(seconds) {
  if (seconds === null || seconds === undefined || Math.abs(seconds) <= 60) return 'text-gray-600';
  return seconds > 60 ? 'text-red-600' : 'text-green-600';
}

onMounted(fetchLines);
</script>

<style scoped>
.form-select, .form-input {
  @apply block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-green focus:border-brand-green sm:text-sm;
}
.th-cell {
  @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider;
}
.td-cell {
  @apply px-6 py-4 whitespace-nowrap text-sm text-gray-500;
}
</style>
