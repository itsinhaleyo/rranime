(() => {
    const preferenceKey = 'rranime-title-language';
    const readPreference = () => {
        try {
            return localStorage.getItem(preferenceKey) === 'ja' ? 'ja' : 'en';
        } catch {
            return 'en';
        }
    };

    function applyAnimeTitleLanguage(language) {
        const selectedLanguage = language === 'ja' ? 'ja' : 'en';
        document.documentElement.dataset.titleLanguage = selectedLanguage;
        document.querySelectorAll('[data-anime-title]').forEach(element => {
            const englishTitle = element.dataset.titleEn || element.dataset.titleJa || '';
            const japaneseTitle = element.dataset.titleJa || englishTitle;
            const selectedTitle = selectedLanguage === 'ja' ? japaneseTitle : englishTitle;
            element.textContent = selectedTitle;
            if (element.hasAttribute('title')) element.setAttribute('title', selectedTitle);
            if (element.tagName === 'TITLE') document.title = selectedTitle;
        });
        const toggle = document.getElementById('title-language-switch');
        if (toggle) {
            const isJapanese = selectedLanguage === 'ja';
            toggle.setAttribute('aria-checked', String(isJapanese));
            toggle.setAttribute('aria-label', `Anime titles in ${isJapanese ? 'Japanese' : 'English'}`);
        }
    }

    window.applyAnimeTitleLanguage = applyAnimeTitleLanguage;

    document.addEventListener('DOMContentLoaded', () => {
        applyAnimeTitleLanguage(readPreference());
        const toggle = document.getElementById('title-language-switch');
        toggle?.addEventListener('click', () => {
            const nextLanguage = toggle.getAttribute('aria-checked') === 'true' ? 'en' : 'ja';
            try {
                localStorage.setItem(preferenceKey, nextLanguage);
            } catch {
                // Keep the switch usable when browser storage is unavailable.
            }
            applyAnimeTitleLanguage(nextLanguage);
        });
    });
})();
