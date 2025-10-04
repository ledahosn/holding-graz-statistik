<template>
  <Disclosure as="nav" class="bg-brand-green-700 text-white shadow-lg z-20" v-slot="{ open }">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center">
          <router-link to="/" class="flex-shrink-0 flex items-center gap-3">
            <img class="h-10 w-auto" src="./assets/logo.png" alt="Graz Statistik Logo" />
            <span class="font-semibold text-xl tracking-wider hidden sm:block">Graz Transport</span>
          </router-link>
        </div>
        <div class="hidden md:block">
          <div class="ml-10 flex items-baseline space-x-4">
            <router-link v-for="item in navigation" :key="item.name" :to="item.href" class="nav-link" active-class="bg-brand-green-800 text-white">
              {{ $t(item.i18nKey) }}
            </router-link>
          </div>
        </div>
        <div class="hidden md:block">
          <LanguageSwitcher />
        </div>
        <div class="-mr-2 flex md:hidden">
          <DisclosureButton class="inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-brand-green-600 focus:outline-none focus:ring-2 focus:ring-white">
            <span class="sr-only">Open main menu</span>
            <Bars3Icon v-if="!open" class="block h-6 w-6" aria-hidden="true" />
            <XMarkIcon v-else class="block h-6 w-6" aria-hidden="true" />
          </DisclosureButton>
        </div>
      </div>
    </div>

    <DisclosurePanel class="md:hidden">
      <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
        <DisclosureButton v-for="item in navigation" :key="item.name" as="router-link" :to="item.href" class="nav-link-mobile" active-class="bg-brand-green-800 text-white">
          {{ $t(item.i18nKey) }}
        </DisclosureButton>
      </div>
      <div class="pt-4 pb-3 border-t border-brand-green-600">
        <LanguageSwitcher />
      </div>
    </DisclosurePanel>
  </Disclosure>
  <main class="flex-grow overflow-y-auto">
    <router-view />
  </main>
</template>

<script setup>
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/vue';
import { Bars3Icon, XMarkIcon } from '@heroicons/vue/24/outline';
import LanguageSwitcher from './components/LanguageSwitcher.vue';

const navigation = [
  { name: 'Home', href: '/', i18nKey: 'home' },
  { name: 'Map', href: '/map', i18nKey: 'liveMap' },
  { name: 'Statistics', href: '/stats', i18nKey: 'statistics' },
  { name: 'Reports', href: '/reports', i18nKey: 'reports' },
];
</script>

<style>
.nav-link {
  @apply text-gray-200 hover:bg-brand-green-600 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors;
}
.nav-link-mobile {
  @apply text-gray-200 hover:bg-brand-green-600 hover:text-white block px-3 py-2 rounded-md text-base font-medium transition-colors;
}
</style>