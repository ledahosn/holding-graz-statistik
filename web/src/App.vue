<template>
  <div class="flex flex-col h-screen">
    <nav class="bg-brand-green-dark text-white shadow-lg z-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center">
            <img class="h-10 w-auto" src="./assets/logo.png" alt="Graz Statistik Logo" />
            <span class="ml-3 font-semibold text-xl tracking-wider">Graz Transport</span>
          </div>
          <div class="hidden md:block">
            <div class="ml-10 flex items-center space-x-4">
              <router-link to="/" class="nav-link" active-class="bg-brand-green-darker">{{ $t('liveMap') }}</router-link>
              <router-link to="/stats" class="nav-link" active-class="bg-brand-green-darker">{{ $t('statistics') }}</router-link>
            </div>
          </div>
          <div class="hidden md:block">
            <LanguageSwitcher />
          </div>
          <!-- Mobile Menu Button -->
          <div class="-mr-2 flex md:hidden">
            <button @click="isMobileMenuOpen = !isMobileMenuOpen" type="button" class="bg-brand-green-dark inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-brand-green focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white" aria-controls="mobile-menu" aria-expanded="false">
              <span class="sr-only">Open main menu</span>
              <svg v-if="!isMobileMenuOpen" class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <svg v-else class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Mobile menu, show/hide based on menu state. -->
      <div v-if="isMobileMenuOpen" class="md:hidden" id="mobile-menu">
        <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          <router-link to="/" @click="isMobileMenuOpen = false" class="nav-link-mobile" active-class="bg-brand-green-darker">{{ $t('liveMap') }}</router-link>
          <router-link to="/stats" @click="isMobileMenuOpen = false" class="nav-link-mobile" active-class="bg-brand-green-darker">{{ $t('statistics') }}</router-link>
        </div>
        <div class="pt-4 pb-3 border-t border-gray-700">
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
    <main class="flex-grow">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import LanguageSwitcher from './components/LanguageSwitcher.vue';

const isMobileMenuOpen = ref(false);
</script>

<style>
.nav-link {
  @apply px-3 py-2 rounded-md text-sm font-medium hover:bg-brand-green transition-colors;
}
.nav-link-mobile {
  @apply text-gray-300 hover:bg-brand-green hover:text-white block px-3 py-2 rounded-md text-base font-medium transition-colors;
}

.bg-brand-green-darker {
  @apply bg-brand-green;
}
</style>