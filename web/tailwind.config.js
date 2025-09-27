/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'brand-green-dark': '#2a5c3d',
                'brand-green': '#5d915d',
                'brand-green-light': '#a3d1a3',
            }
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
    ],
}
