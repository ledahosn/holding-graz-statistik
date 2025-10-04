<template>
  <div class="p-4 sm:p-6 md:p-8 bg-gray-50 h-full">
    <div class="max-w-7xl mx-auto">
      <div class="bg-white shadow-xl rounded-2xl p-6">
        <h1 class="text-3xl font-bold text-gray-800 mb-2">{{ $t('statistics') }}</h1>
        <p class="text-gray-500 mb-8">{{ $t('viewStatsDesc') }}</p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pb-8 border-b border-gray-200">
          <div>
            <label for="line-select" class="block text-sm font-medium text-gray-700 mb-1">{{ $t('selectLine') }}</label>
            <div v-if="isLoading.lines"><SkeletonLoader height="2.5rem" /></div>
            <select v-else id="line-select" v-model="selectedLine" @change="fetchTrips" class="form-select">
              <option disabled value="">{{ $t('pleaseChooseLine') }}</option>
              <optgroup :label="$t('tram')">
                <option v-for="line in tramLines" :key="line.line_number" :value="line.line_number">
                  {{ line.line_name }}
                </option>
              </optgroup>
              <optgroup :label="$t('cityBus')">
                <option v-for="line in busLines" :key="line.line_number" :value="line.line_number">
                  {{ line.line_name }}
                </option>
              </optgroup>
            </select>
          </div>

          <div>
            <label for="date-select" class="block text-sm font-medium text-gray-700 mb-1">{{ $t('date') }}</label>
            <input type="date" id="date-select" v-model="selectedDate" @change="fetchTrips" class="form-input">
          </div>

          <div>
            <label for="trip-select" class="block text-sm font-medium text-gray-700 mb-1">{{ $t('selectTrip') }}</label>
            <div v-if="isLoading.trips"><SkeletonLoader height="2.5rem" /></div>
            <select v-else id="trip-select" v-model="selectedTrip" @change="fetchTripDelays" class="form-select" :disabled="!trips.length">
              <option disabled value="">{{ trips.length ? $t('pleaseChooseTrip') : $t('noTripsFound') }}</option>
              <option v-for="trip in trips" :key="trip.trip_id" :value="trip.trip_id">
                {{ formatTripLabel(trip) }}
              </option>
            </select>
          </div>
        </div>

        <div class="mt-8">
          <div v-if="isLoading.delays" class="py-8">
            <h2 class="text-xl font-semibold text-gray-700 mb-4">
              <SkeletonLoader width="250px" height="1.75rem" />
            </h2>
            <div class="space-y-2">
              <SkeletonLoader v-for="i in 10" :key="i" height="2rem" />
            </div>
          </div>
          <div v-else-if="error" class="text-center py-8">
            <p class="text-red-500">{{ error }}</p>
          </div>
          <div v-else-if="tripDelays.length > 0">
            <h2 class="text-xl font-semibold text-gray-700 mb-4">{{ $t('delayDetailsForTrip') }}</h2>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="th-cell">{{ $t('stopName') }}</th>
                  <th scope="col" class="th-cell">{{ $t('plannedArrival') }}</th>
                  <th scope="col" class="th-cell">{{ $t('actualArrival') }}</th>
                  <th scope="col" class="th-cell text-right">{{ $t('delay') }}</th>
                </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="stop in tripDelays" :key="stop.stop_id">
                  <td class="td-cell font-medium text-gray-900">{{ stop.stop_name }}</td>
                  <td class="td-cell">{{ formatTime(stop.planned_time) }}</td>
                  <td class="td-cell">{{ formatTime(stop.actual_time) }}</td>
                  <td :class="['td-cell font-semibold text-right', getDelayColor(stop.arrival_delay_seconds)]">
                    {{ formatDelay(stop.arrival_delay_seconds) }}
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import SkeletonLoader from '../components/SkeletonLoader.vue';

const { t } = useI18n();

const lines = ref([]);
const selectedLine = ref('');
const selectedDate = ref(new Date().toISOString().split('T')[0]);
const trips = ref([]);
const selectedTrip = ref('');
const tripDelays = ref([]);
const isLoading = reactive({ lines: false, trips: false, delays: false });
const error = ref(null);

const API_BASE_URL = '/api';

const tramLines = computed(() => lines.value.filter(l => l.product === 'tram'));
const busLines = computed(() => lines.value.filter(l => l.product === 'city-bus'));

async function fetchLines() {
  isLoading.lines = true;
  error.value = null;
  try {
    const response = await fetch(`${API_BASE_URL}/lines`);
    if (!response.ok) throw new Error('Failed to load lines.');
    lines.value = await response.json();
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.lines = false;
  }
}

async function fetchTrips() {
  if (!selectedLine.value || !selectedDate.value) return;
  isLoading.trips = true;
  error.value = null;
  trips.value = [];
  selectedTrip.value = '';
  tripDelays.value = [];

  try {
    const response = await fetch(`${API_BASE_URL}/trips?lineNumber=${selectedLine.value}&date=${selectedDate.value}`);
    if (!response.ok) throw new Error('Failed to load trips.');
    trips.value = await response.json();
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.trips = false;
  }
}

async function fetchTripDelays() {
  if (!selectedTrip.value) {
    tripDelays.value = [];
    return;
  }
  isLoading.delays = true;
  error.value = null;
  tripDelays.value = [];

  try {
    const response = await fetch(`${API_BASE_URL}/trip/delays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: selectedTrip.value }),
    });
    if (!response.ok) throw new Error('Failed to load delay data.');
    tripDelays.value = await response.json();
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.delays = false;
  }
}

function formatTripLabel(trip) {
  return `${trip.direction} (${trip.departure_time.slice(0, 5)})`;
}

function formatTime(timestamp) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
}

function formatDelay(seconds) {
  if (seconds === null || seconds === undefined) return t('onTime');
  if (Math.abs(seconds) <= 60) return t('onTime');
  const minutes = Math.round(Math.abs(seconds) / 60);
  return seconds > 0 ? `+${minutes} min` : `-${minutes} min`;
}

function getDelayColor(seconds) {
  if (seconds === null || seconds === undefined || Math.abs(seconds) <= 60) return 'text-gray-600';
  return seconds > 60 ? 'text-red-600' : 'text-blue-600';
}

onMounted(fetchLines);
</script>

<style scoped>
.form-select, .form-input {
  @apply block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-green focus:border-brand-green sm:text-sm transition-colors;
}
.th-cell {
  @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider;
}
.td-cell {
  @apply px-6 py-4 whitespace-nowrap text-sm text-gray-700;
}
</style>