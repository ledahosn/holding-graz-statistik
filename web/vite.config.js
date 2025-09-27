import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    server: {
        // This is needed to make the dev server accessible from outside the container
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            // Proxy API requests to the backend server
            '/api': {
                target: 'http://api:3001',
                changeOrigin: true,
            },
        },
    },
});
