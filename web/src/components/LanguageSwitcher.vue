<template>
  <div class="flex items-center justify-center space-x-2 px-5">
    <button
        @click="setLocale('en')"
        :class="['lang-button', { 'active': locale === 'en' }]"
    >
      EN
    </button>
    <button
        @click="setLocale('de')"
        :class="['lang-button', { 'active': locale === 'de' }]"
    >
      DE
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
const { locale } = useI18n();

function setLocale(newLocale) {
  locale.value = newLocale;
}
</script>

<style scoped>
.lang-button {
  @apply px-3 py-1 rounded-md text-sm font-medium text-gray-300 hover:text-white hover:bg-brand-green transition-colors;
}
.lang-button.active {
  @apply bg-brand-green text-white font-bold;
}
</style>
