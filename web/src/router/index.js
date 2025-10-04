import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import MapView from '../views/MapView.vue';
import StatsView from '../views/StatsView.vue';
import ReportsView from '../views/ReportsView.vue';


const routes = [
    {
        path: '/',
        name: 'Home',
        component: HomeView,
    },
    {
        path: '/map',
        name: 'Map',
        component: MapView,
    },
    {
        path: '/stats',
        name: 'Stats',
        component: StatsView,
    },
    {
        path: '/reports',
        name: 'Reports',
        component: ReportsView,
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

export default router;