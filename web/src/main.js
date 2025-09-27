import { initMap } from './map.js';
import { initStats } from './stats.js';

const contentEl = document.getElementById('content');
const navLinks = document.querySelectorAll('.nav-link');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');

// --- Mobile Menu Toggle ---
mobileMenuButton.addEventListener('click', () => {
    const isExpanded = mobileMenuButton.getAttribute('aria-expanded') === 'true';
    mobileMenuButton.setAttribute('aria-expanded', !isExpanded);
    mobileMenu.classList.toggle('hidden');
    // Toggle icons (hamburger/close)
    mobileMenuButton.querySelectorAll('svg').forEach(icon => icon.classList.toggle('hidden'));
});

// --- Simple Hash-based Router ---
const routes = {
    '/': initMap,
    '/stats': initStats
};

function router() {
    const path = window.location.hash.slice(1) || '/';
    const view = routes[path] || routes['/']; // Default to map view

    // Update active link style
    navLinks.forEach(link => {
        link.classList.remove('bg-gray-900', 'text-white');
        link.classList.add('text-gray-300', 'hover:bg-gray-700', 'hover:text-white');
        if (link.getAttribute('href') === `#${path}`) {
            link.classList.add('bg-gray-900', 'text-white');
            link.classList.remove('text-gray-300', 'hover:bg-gray-700', 'hover:text-white');
        }
    });

    // Render the current view
    view(contentEl);
}

// Listen for hash changes and initial page load
window.addEventListener('hashchange', router);
window.addEventListener('load', router);