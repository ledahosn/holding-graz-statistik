<template>
  <Menu as="div" class="relative inline-block text-left">
    <div>
      <MenuButton class="inline-flex w-full justify-center items-center gap-x-2 rounded-md px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors">
        <GlobeAltIcon class="h-5 w-5" aria-hidden="true" />
        {{ currentLangLabel }}
        <ChevronDownIcon class="h-5 w-5 text-white/60" aria-hidden="true" />
      </MenuButton>
    </div>

    <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
      <MenuItems class="absolute right-0 z-10 mt-2 w-36 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
        <div class="py-1">
          <MenuItem v-slot="{ active }" @click="setLocale('en')">
            <a href="#" :class="[active ? 'bg-gray-100 text-gray-900' : 'text-gray-700', 'group flex items-center gap-x-2 px-4 py-2 text-sm']">
              <EnFlagIcon />
              English
            </a>
          </MenuItem>
          <MenuItem v-slot="{ active }" @click="setLocale('de')">
            <a href="#" :class="[active ? 'bg-gray-100 text-gray-900' : 'text-gray-700', 'group flex items-center gap-x-2 px-4 py-2 text-sm']">
              <DeFlagIcon />
              Deutsch
            </a>
          </MenuItem>
        </div>
      </MenuItems>
    </transition>
  </Menu>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import { ChevronDownIcon, GlobeAltIcon } from '@heroicons/vue/20/solid';
import EnFlagIcon from './icons/EnFlagIcon.vue';
import DeFlagIcon from './icons/DeFlagIcon.vue';

const { locale } = useI18n();

const setLocale = (newLocale) => {
  locale.value = newLocale;
};

const currentLangLabel = computed(() => locale.value.toUpperCase());
</script>