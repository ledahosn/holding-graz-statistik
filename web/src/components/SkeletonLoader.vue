<template>
  <div class="animate-pulse" :style="{ height: height, width: width, borderRadius: rounded }">
    <div class="h-full w-full bg-gray-200 rounded-md"></div>
  </div>
</template>

<script setup>
defineProps({
  height: { type: String, default: '1rem' },
  width: { type: String, default: '100%' },
  rounded: { type: String, default: '0.375rem' }
});
</script>