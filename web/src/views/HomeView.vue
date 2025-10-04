<template>
  <div class="bg-gray-50 flex flex-col items-center justify-center text-center h-full p-4">
    <div class="max-w-4xl mx-auto">
      <img :src="logo" alt="Graz Statistik Logo" class="h-48 w-48 mx-auto mb-6 drop-shadow-lg" />
      <h1 class="text-5xl font-extrabold text-gray-800">
        Graz Transport <span class="text-brand-green-700">Statistics</span>
      </h1>
      <p class="mt-4 text-xl text-gray-500 max-w-2xl mx-auto">
        {{ $t('tagline') }}
      </p>

      <div class="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <router-link to="/map" class="card-link group">
          <div class="card-content">
            <MapIcon class="h-12 w-12 text-brand-green-600 mb-4" />
            <h2 class="text-2xl font-bold text-gray-900">{{ $t('exploreMap') }}</h2>
            <p class="mt-2 text-gray-600">{{ $t('exploreMapDesc') }}</p>
          </div>
        </router-link>

        <router-link to="/stats" class="card-link group">
          <div class="card-content">
            <ChartBarIcon class="h-12 w-12 text-brand-green-600 mb-4" />
            <h2 class="text-2xl font-bold text-gray-900">{{ $t('viewStats') }}</h2>
            <p class="mt-2 text-gray-600">{{ $t('viewStatsDesc') }}</p>
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { MapIcon, ChartBarIcon } from '@heroicons/vue/24/outline';
import logo from '../assets/logo.png';
</script>

<style scoped>
.card-link {
  @apply block bg-white rounded-2xl shadow-lg hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300 ease-in-out overflow-hidden;
}
.card-content {
  @apply p-8;
}
</style>