import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import './style.css'
import App from './App.vue'
import router from './router'

// I18n translations
import en from './i18n/en.json'
import de from './i18n/de.json'

// Detect browser language or default to 'en'
const userLang = navigator.language.split('-')[0];
const supportedLangs = ['en', 'de'];
const defaultLang = supportedLangs.includes(userLang) ? userLang : 'en';

const i18n = createI18n({
    legacy: false, // Use Composition API
    locale: defaultLang,
    fallbackLocale: 'en',
    messages: { en, de },
});


const app = createApp(App)

app.use(router)
app.use(i18n)

app.mount('#app')
