import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        // This is needed to make the dev server accessible from outside the container
        host: '0.0.0.0',
        port: 5173
    }
});