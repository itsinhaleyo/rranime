document.addEventListener('DOMContentLoaded', () => {
    function setupAutocomplete(inputId, dropdownId) {
        const searchInput = document.getElementById(inputId);
        const searchBar = document.getElementById(dropdownId);
        let debounceTimer;
        if (!searchInput || !searchBar) return;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim();
            if (query.length < 2) {
                searchBar.innerHTML = '';
                searchBar.style.display = 'none';
                return;
            }
            debounceTimer = setTimeout(() => {
                fetchSuggestions(query, searchBar);
            }, 300);
        });
        searchBar.addEventListener('click', (e) => {
            const item = e.target.closest('.suggestion-item');
            if (item) {
                const animeId = item.dataset.id;
                searchBar.innerHTML = '';
                searchBar.style.display = 'none';
                window.location.href = `/anime/${animeId}`; 
            }
        });
    }
    async function fetchSuggestions(query, searchBarContainer) {
        try {
            const response = await fetch(`https://rranime.online/api/anime-suggestions?q=${encodeURIComponent(query)}`);
            const animeList = await response.json();
            if (!Array.isArray(animeList) || animeList.length === 0) {
                searchBarContainer.style.display = 'none';
                return;
            }
            const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[character]));
            searchBarContainer.innerHTML = animeList.map(anime => {
                const englishTitle = escapeHtml(anime.english_title || anime.title || 'Untitled anime');
                const japaneseTitle = escapeHtml(anime.japanese_title || anime.title || englishTitle);
                const image = escapeHtml(anime.image_url || '');
                return `
                    <div class="suggestion-item" data-id="${escapeHtml(anime.mal_id)}" data-title="${englishTitle}">
                        <img src="${image}" alt="" class="suggestion-thumb">
                        <div class="suggestion-info">
                            <span class="suggestion-title" data-anime-title data-title-en="${englishTitle}" data-title-ja="${japaneseTitle}">${englishTitle}</span>
                            <small class="suggestion-meta">${escapeHtml(anime.type || 'Anime')} • ⭐ ${escapeHtml(anime.score || 'N/A')}</small>
                        </div>
                    </div>
                `;
            }).join('');
            window.applyAnimeTitleLanguage?.(document.documentElement.dataset.titleLanguage || 'en');
            searchBarContainer.style.display = 'block';
        } catch (error) {
            console.error('Error fetching anime suggestions:', error);
        }
    }
    setupAutocomplete('anime-search-input-pc', 'search-suggestions-pc');
    setupAutocomplete('anime-search-input-mobile', 'search-suggestions-mobile');

    const notificationMenu = document.getElementById('notification-menu');
    const notificationBell = document.getElementById('notification-bell');
    const notificationDropdown = document.getElementById('notification-dropdown');
    const notificationList = document.getElementById('notification-dropdown-list');
    const notificationBadge = document.getElementById('notification-badge');
    const notificationCount = document.getElementById('notification-dropdown-count');

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function formatNotificationDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
    }

    async function loadNotifications() {
        if (!notificationList) return;
        notificationList.innerHTML = '<p class="notification-dropdown-status">Loading notifications…</p>';
        try {
            const response = await fetch('/api/notifications/preview', {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error(`Request failed: ${response.status}`);
            const data = await response.json();
            const items = Array.isArray(data.notifications) ? data.notifications : [];
            const unread = Number(data.unreadCount) || 0;

            notificationBadge.hidden = unread === 0;
            notificationBadge.textContent = unread > 99 ? '99+' : String(unread);
            notificationCount.textContent = unread ? `${unread} unread` : `${items.length} recent`;

            if (items.length === 0) {
                notificationList.innerHTML = '<p class="notification-dropdown-status">No notifications yet.</p>';
                return;
            }

            notificationList.innerHTML = items.map(item => {
                const animeId = encodeURIComponent(item.anime_id);
                const episode = encodeURIComponent(item.episode_number);
                const isCommentReply = item.notification_type === 'comment';
                const commentId = encodeURIComponent(item.comment_id || '');
                const title = escapeHtml(item.title || 'New episode available');
                const message = escapeHtml(item.message || `Episode ${item.episode_number} is now available.`);
                const createdAt = escapeHtml(formatNotificationDate(item.created_at));
                const target = `/anime/${animeId}/${episode}${isCommentReply ? `#comment-${commentId}` : ''}`;
                return `<a class="notification-dropdown-item ${item.is_read ? '' : 'is-unread'}" href="${target}">
                    <span class="notification-dropdown-icon"><i class="fas ${isCommentReply ? 'fa-reply' : 'fa-play'}" aria-hidden="true"></i></span>
                    <span class="notification-dropdown-copy">
                        <strong>${title}</strong>
                        <small>${message}</small>
                        <time>${createdAt}</time>
                    </span>
                </a>`;
            }).join('');
        } catch (error) {
            notificationList.innerHTML = '<p class="notification-dropdown-status">Could not load notifications.</p>';
            console.error('Error loading notification preview:', error);
        }
    }

    if (notificationMenu && notificationBell && notificationDropdown) {
        notificationBell.addEventListener('click', () => {
            const opening = notificationDropdown.hidden;
            notificationDropdown.hidden = !opening;
            notificationBell.setAttribute('aria-expanded', String(opening));
            if (opening) loadNotifications();
        });
        loadNotifications();
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.drawer-search-wrapper1') && !e.target.closest('.drawer-search-wrapper2')) {
            const pcDropdown = document.getElementById('search-suggestions-pc');
            const mobileDropdown = document.getElementById('search-suggestions-mobile');
            if (pcDropdown) pcDropdown.style.display = 'none';
            if (mobileDropdown) mobileDropdown.style.display = 'none';
        }
        if (notificationMenu && !notificationMenu.contains(e.target)) {
            notificationDropdown.hidden = true;
            notificationBell.setAttribute('aria-expanded', 'false');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && notificationDropdown && !notificationDropdown.hidden) {
            notificationDropdown.hidden = true;
            notificationBell.setAttribute('aria-expanded', 'false');
            notificationBell.focus();
        }
    });
});
