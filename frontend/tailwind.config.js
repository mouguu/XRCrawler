/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'washi': '#f0f0ea',
                'charcoal': '#2c2c2c',
                'stone': '#7a7a7a',
                'clay': '#8b7e74',
                'moss': '#6e7866',
                'rust': '#a65e4e',
            },
            fontFamily: {
                serif: ['"Source Sans 3"', 'sans-serif'],
                display: ['"Sora"', 'sans-serif'],
                sans: ['"Source Sans 3"', 'sans-serif'],
            },
            animation: {
                'drift': 'drift 20s infinite linear',
            },
            keyframes: {
                drift: {
                    '0%': { transform: 'translate(0, 0)' },
                    '50%': { transform: 'translate(10px, 15px)' },
                    '100%': { transform: 'translate(0, 0)' },
                }
            }
        },
    },
    plugins: [],
}
