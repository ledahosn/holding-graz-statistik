/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'brand-green': {
                    DEFAULT: '#6ec00f',
                    '50': '#f2fbe6',
                    '100': '#e5f6cd',
                    '200': '#ceeda0',
                    '300': '#b8e572',
                    '400': '#9fd945',
                    '500': '#83ca1f',
                    '600': '#6ec00f',
                    '700': '#57960d',
                    '800': '#45760e',
                    '900': '#396012',
                    '950': '#1e3606',
                },
            }
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
    ],
}