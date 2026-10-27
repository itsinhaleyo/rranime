document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('landing-search-input');
    const suggestions = document.getElementById('landing-search-suggestions');
    if (!input || !suggestions) return;

    let debounceTimer;
    let activeRequest;

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));

    function closeSuggestions() {
        suggestions.hidden = true;
        input.setAttribute('aria-expanded', 'false');
    }

    function showStatus(message) {
        suggestions.innerHTML = `<div class="landing-suggestion-status">${escapeHtml(message)}</div>`;
        suggestions.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    async function searchAnime(query) {
        if (activeRequest) activeRequest.abort();
        activeRequest = new AbortController();
        showStatus('Searching…');

        try {
            const response = await fetch(`/api/anime-suggestions?q=${encodeURIComponent(query)}`, {
                headers: { Accept: 'application/json' },
                signal: activeRequest.signal
            });
            if (!response.ok) throw new Error(`Request failed: ${response.status}`);
            const animeList = await response.json();

            if (!Array.isArray(animeList) || animeList.length === 0) {
                showStatus('No matching anime found.');
                return;
            }

            suggestions.innerHTML = animeList.map(anime => {
                const title = escapeHtml(anime.english_title || anime.title || 'Untitled anime');
                const type = escapeHtml(anime.type || 'Anime');
                const score = escapeHtml(anime.score || 'N/A');
                const animeId = encodeURIComponent(anime.mal_id);
                const image = anime.image_url
                    ? `<img class="landing-suggestion-thumb" src="${escapeHtml(anime.image_url)}" alt="" loading="lazy">`
                    : '<span class="landing-suggestion-thumb" aria-hidden="true"></span>';
                return `<a class="landing-suggestion-item" role="option" href="/anime/${animeId}">
                    ${image}
                    <span class="landing-suggestion-copy">
                        <strong>${title}</strong>
                        <small>${type} · ★ ${score}</small>
                    </span>
                </a>`;
            }).join('');
            suggestions.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Landing page anime suggestions failed:', error);
                closeSuggestions();
            }
        }
    }

    input.addEventListener('input', () => {
        window.clearTimeout(debounceTimer);
        if (activeRequest) activeRequest.abort();
        const query = input.value.trim();
        if (query.length < 2) {
            closeSuggestions();
            return;
        }
        debounceTimer = window.setTimeout(() => searchAnime(query), 250);
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' && !suggestions.hidden) {
            const firstSuggestion = suggestions.querySelector('a');
            if (firstSuggestion) {
                event.preventDefault();
                firstSuggestion.focus();
            }
        } else if (event.key === 'Escape') {
            closeSuggestions();
        }
    });

    suggestions.addEventListener('keydown', event => {
        const items = Array.from(suggestions.querySelectorAll('a'));
        const currentIndex = items.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' && currentIndex < items.length - 1) {
            event.preventDefault();
            items[currentIndex + 1].focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (currentIndex > 0) items[currentIndex - 1].focus();
            else input.focus();
        } else if (event.key === 'Escape') {
            closeSuggestions();
            input.focus();
        }
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('.search-container')) closeSuggestions();
    });
});
