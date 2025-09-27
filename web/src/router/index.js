import { createRouter, createWebHashHistory } from 'vue-router';
import MapView from '../views/MapView.vue';
import StatsView from '../views/StatsView.vue';

const routes = [
    {
        path: '/',
        name: 'Map',
        component: MapView,
    },
    {
        path: '/stats',
        name: 'Stats',
        component: StatsView,
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

export default router;

