import { defineConfig, presetUno, presetIcons } from 'unocss'

export default defineConfig({
    presets: [
        presetUno({ dark: 'class' }),
        presetIcons({
            scale: 1.2,
            extraProperties: {
                'display': 'inline-block',
                'vertical-align': 'middle',
            },
        }),
    ],
    theme: {
        colors: {
            bg: { DEFAULT: '#0a0c14', 2: '#111422', 3: '#1a1f2e', 4: '#222840' },
            accent: '#00d4aa',
            blue: '#0099ff',
            purple: '#7c5cfc',
            danger: '#ff4d6d',
            muted: { DEFAULT: '#6b7291', 2: '#8b92b0' },
            border: { DEFAULT: 'rgba(255,255,255,0.07)', 2: 'rgba(255,255,255,0.12)' },
        },
    },
    shortcuts: {
        'btn': 'px-3.5 py-2 rounded-2.5 text-sm font-medium cursor-pointer transition-all duration-200 inline-flex items-center gap-1.5 border-none',
        'btn-primary': 'btn bg-gradient-to-br from-accent to-blue text-white hover:opacity-90',
        'btn-ghost': 'btn bg-bg-3 border border-border-2 text-muted-2 hover:text-white',
        'btn-danger': 'btn bg-danger/15 border border-danger/40 text-danger hover:bg-danger/25',
        'glass': 'bg-bg-2 border border-border backdrop-blur-xl',
        'card-base': 'glass rounded-4 overflow-hidden cursor-pointer transition-all duration-220 relative hover:border-accent/25 hover:translate-y--0.75 hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)]',
    },
})
