document.addEventListener('DOMContentLoaded', () => {
    const roomPage = document.getElementById('watch-room');
    if (!roomPage) return;

    const roomId = roomPage.dataset.roomId;
    const animeId = roomPage.dataset.animeId;
    const isHost = roomPage.dataset.isHost === 'true';
    let audio = roomPage.dataset.audio === 'dub' ? 'dub' : 'sub';
    const player = document.getElementById('watch-room-player');
    const playerWrap = document.getElementById('watch-room-player-wrap');
    const status = document.getElementById('watch-room-status');
    const messages = document.getElementById('watch-room-messages');
    const viewerList = document.getElementById('watch-room-viewers');
    const viewerCount = document.getElementById('watch-room-viewer-count');
    const startButton = document.getElementById('watch-room-start');
    let currentEpisode = Number(roomPage.dataset.currentEpisode);
    let totalEpisodes = Number(roomPage.dataset.totalEpisodes);
    const displayTotalEpisodes = Number(roomPage.dataset.displayTotalEpisodes) || totalEpisodes;
    let seriesFinished = roomPage.dataset.seriesFinished === 'true';
    let paused = roomPage.dataset.paused === 'true';
    let currentPosition = Number(roomPage.dataset.position) || 0;
    let expectedOrigin = new URL(player.src).origin;
    let lastStatePostAt = 0;
    let advancing = false;
    let playbackStarted = false;
    let completionArmed = false;
    let roomClosed = false;
    let episodeNavigationStarted = false;
    let lastMessageId = 0;
    const eventSource = new EventSource(`/api/watch-rooms/${encodeURIComponent(roomId)}/events`);

    messages.querySelectorAll('[data-message-id]').forEach(element => {
        const id = Number(element.dataset.messageId);
        if (Number.isSafeInteger(id)) lastMessageId = Math.max(lastMessageId, id);
    });

    const sendPlayer = (type, fields = {}) => {
        if (!player?.contentWindow) return;
        player.contentWindow.postMessage({ channel: 'zokoanime', type, ...fields }, expectedOrigin);
    };

    const requestJson = async (path, body) => {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Room request failed.');
        return result;
    };

    const postState = (force = false) => {
        if (!isHost) return;
        const now = Date.now();
        if (!force && now - lastStatePostAt < 1600) return;
        lastStatePostAt = now;
        requestJson(`/api/watch-rooms/${encodeURIComponent(roomId)}/state`, {
            position: currentPosition,
            paused
        }).catch(error => {
            status.textContent = error.message;
        });
    };

    const applyPlaybackState = (state) => {
        if (Number.isFinite(Number(state.position))) {
            const expectedPosition = Number(state.position) + (state.paused ? 0 : Math.max(0, (Date.now() - Number(state.sentAt || Date.now())) / 1000));
            currentPosition = expectedPosition;
            sendPlayer('seek', { time: expectedPosition });
        }
        paused = Boolean(state.paused);
        sendPlayer(paused ? 'pause' : 'play');
        startButton.hidden = paused;
        if (!paused) {
            window.setTimeout(() => {
                if (!paused && status.textContent !== 'Playback synced') startButton.hidden = false;
            }, 2200);
        }
    };

    const navigateToEpisode = episode => {
        const nextEpisode = Number(episode);
        if (!Number.isSafeInteger(nextEpisode) || nextEpisode < 1 || nextEpisode === currentEpisode || episodeNavigationStarted) return;
        episodeNavigationStarted = true;
        window.location.replace(`/watch2gether/${encodeURIComponent(roomId)}/episode/${encodeURIComponent(nextEpisode)}`);
    };

    const changeRoomEpisode = async direction => {
        if (!isHost || advancing || ![-1, 1].includes(direction)) return;
        const targetEpisode = currentEpisode + direction;
        if (targetEpisode < 1 || (direction > 0 && totalEpisodes > 0 && targetEpisode > totalEpisodes)) return;
        advancing = true;
        const previousButton = document.getElementById('watch-room-previous');
        const nextButton = document.getElementById('watch-room-next');
        if (previousButton) previousButton.disabled = true;
        if (nextButton) nextButton.disabled = true;
        status.textContent = `Moving everyone to episode ${targetEpisode}…`;
        try {
            const result = await requestJson(`/api/watch-rooms/${encodeURIComponent(roomId)}/episode`, { episode: targetEpisode });
            navigateToEpisode(result.episode);
        } catch (error) {
            advancing = false;
            status.textContent = error.message;
            if (previousButton) previousButton.disabled = currentEpisode <= 1;
            if (nextButton) nextButton.disabled = totalEpisodes > 0 && currentEpisode >= totalEpisodes;
        }
    };

    const setRoomAudio = (nextAudio, position = currentPosition, nextPaused = paused, sentAt = Date.now()) => {
        if (!['sub', 'dub'].includes(nextAudio)) return;
        if (nextAudio === audio) return;
        audio = nextAudio;
        currentPosition = Number(position) + (nextPaused ? 0 : Math.max(0, (Date.now() - Number(sentAt || Date.now())) / 1000));
        paused = Boolean(nextPaused);
        playbackStarted = false;
        completionArmed = false;
        roomPage.dataset.audio = audio;
        document.getElementById('watch-room-audio-label').textContent = audio.toUpperCase();
        document.getElementById('watch-room-player-audio').textContent = audio.toUpperCase();
        document.querySelectorAll('[data-room-audio-option]').forEach(button => {
            const active = button.dataset.roomAudioOption === audio;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        const roomAudioValue = document.getElementById('room-series-audio-value');
        if (roomAudioValue) roomAudioValue.textContent = audio.toUpperCase();
        const episodePageLink = document.getElementById('watch-room-episode-page-link');
        if (episodePageLink) episodePageLink.href = `/anime/${encodeURIComponent(animeId)}/${encodeURIComponent(currentEpisode)}?audio=${encodeURIComponent(audio)}`;
        const params = new URLSearchParams({ color: 'ff3c20', autoplay: 'true', autonext: 'true' });
        player.src = `https://zokoanime.video/stream/mal/${encodeURIComponent(animeId)}/${encodeURIComponent(currentEpisode)}/${audio}?${params}`;
        expectedOrigin = 'https://zokoanime.video';
        status.textContent = `Switching the room to ${audio.toUpperCase()}…`;
    };

    const closeRoom = reason => {
        if (roomClosed) return;
        roomClosed = true;
        status.textContent = reason || 'This room has ended.';
        eventSource.close();
        player.remove();
        const closedNotice = document.createElement('div');
        closedNotice.className = 'watch-room-closed-notice';
        closedNotice.textContent = reason || 'This room has ended.';
        playerWrap.append(closedNotice);
        const chatInput = document.getElementById('watch-room-chat-input');
        if (chatInput) chatInput.disabled = true;
        const chatButton = document.querySelector('.watch-room-chat-form button');
        if (chatButton) chatButton.disabled = true;
        const endButton = document.getElementById('watch-room-end');
        if (endButton) endButton.disabled = true;
    };

    const advanceRoom = async () => {
        if (!isHost || advancing) return;
        advancing = true;
        status.textContent = 'Moving everyone to the next episode…';
        try {
            const result = await requestJson(`/api/watch-rooms/${encodeURIComponent(roomId)}/advance`, {});
            if (result.ended) closeRoom('The series has ended. This room is closed.');
            else if (Number(result.episode) > currentEpisode) navigateToEpisode(result.episode);
        } catch (error) {
            advancing = false;
            status.textContent = error.message;
        }
    };

    const appendMessage = message => {
        const numericId = Number(message.messageId);
        if (Number.isSafeInteger(numericId) && numericId <= lastMessageId) return;
        if (Number.isSafeInteger(numericId)) lastMessageId = numericId;
        const article = document.createElement('article');
        article.className = 'watch-room-message';
        const meta = document.createElement('div');
        meta.className = 'watch-room-message-meta';
        const name = document.createElement('strong');
        name.textContent = message.displayName || 'Anime fan';
        const time = document.createElement('time');
        time.textContent = new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const body = document.createElement('p');
        body.textContent = message.body || '';
        meta.append(name, time);
        article.append(meta, body);
        messages.append(article);
        messages.scrollTop = messages.scrollHeight;
    };

    eventSource.addEventListener('room', event => {
        const room = JSON.parse(event.data);
        totalEpisodes = Number(room.totalEpisodes) || totalEpisodes;
        seriesFinished = Boolean(room.seriesFinished);
        applyPlaybackState({ position: room.position, paused: room.paused, sentAt: Date.now() });
        status.textContent = 'Connected · playback follows the room host';
    });

    eventSource.addEventListener('presence', event => {
        const data = JSON.parse(event.data);
        const members = data.members || [];
        viewerCount.textContent = String(members.length);
        viewerList.replaceChildren();
        members.forEach(member => {
            const chip = document.createElement('span');
            chip.className = `watch-room-viewer-chip${member.userId === roomPage.dataset.hostUserId ? ' host' : ''}`;
            chip.textContent = member.userId === roomPage.dataset.currentUserId
                ? `${member.displayName} (you)`
                : member.displayName;
            viewerList.append(chip);
        });
    });

    eventSource.addEventListener('state', event => {
        if (isHost) return;
        const state = JSON.parse(event.data);
        const expectedPosition = Number(state.position) + (state.paused ? 0 : Math.max(0, (Date.now() - Number(state.sentAt || Date.now())) / 1000));
        const requestedPaused = Boolean(state.paused);
        if (requestedPaused !== paused) {
            paused = requestedPaused;
            sendPlayer(paused ? 'pause' : 'play');
        }
        if (!paused && Math.abs(expectedPosition - currentPosition) > 2.5) {
            currentPosition = expectedPosition;
            sendPlayer('seek', { time: expectedPosition });
        } else if (paused && Math.abs(expectedPosition - currentPosition) > 1) {
            currentPosition = expectedPosition;
            sendPlayer('seek', { time: expectedPosition });
        }
        status.textContent = 'Playback synced';
    });

    eventSource.addEventListener('episode', event => {
        const data = JSON.parse(event.data);
        navigateToEpisode(data.episode);
    });

    eventSource.addEventListener('audio', event => {
        const data = JSON.parse(event.data);
        setRoomAudio(data.audio, data.position, data.paused, data.sentAt);
    });

    eventSource.addEventListener('chat', event => appendMessage(JSON.parse(event.data)));
    eventSource.addEventListener('closed', event => {
        const data = JSON.parse(event.data);
        closeRoom(data.reason);
    });
    eventSource.onerror = () => {
        status.textContent = 'Reconnecting to the room…';
    };

    window.addEventListener('message', event => {
        if (event.source !== player.contentWindow || event.origin !== expectedOrigin) return;
        let message = event.data;
        if (typeof message === 'string') {
            try { message = JSON.parse(message); } catch { return; }
        }
        if (!message || message.channel !== 'zokoanime' || typeof message.type !== 'string') return;

        if (message.type === 'ready') {
            sendPlayer('autoplay', { on: true });
            sendPlayer('autonext', { on: true });
            sendPlayer('state');
            applyPlaybackState({ position: currentPosition, paused, sentAt: Date.now() });
        } else if (message.type === 'play') {
            playbackStarted = true;
            startButton.hidden = true;
            status.textContent = 'Playback synced';
            if (!isHost) return;
            paused = false;
            completionArmed = true;
            postState(true);
        } else if (message.type === 'pause' && isHost) {
            paused = true;
            postState(true);
        } else if ((message.type === 'time' || message.type === 'watching-log') && isHost) {
            currentPosition = Number(message.position ?? message.currentTime) || currentPosition;
            postState();
        } else if (message.type === 'seeked' && isHost) {
            currentPosition = Number(message.position) || 0;
            postState(true);
        } else if (message.type === 'state' && isHost) {
            currentPosition = Number(message.position) || currentPosition;
            paused = Boolean(message.paused);
            postState(true);
        } else if ((message.type === 'ended' || message.type === 'complete') && isHost) {
            if (completionArmed) {
                completionArmed = false;
                advanceRoom();
            }
        }
    });

    startButton.addEventListener('click', () => {
        sendPlayer('seek', { time: currentPosition });
        sendPlayer('play');
        startButton.hidden = true;
        status.textContent = 'Joining the host’s playback…';
    });

    const chatForm = document.getElementById('watch-room-chat-form');
    chatForm.addEventListener('submit', async event => {
        event.preventDefault();
        const input = document.getElementById('watch-room-chat-input');
        const body = input.value.trim();
        if (!body) return;
        try {
            await requestJson(`/api/watch-rooms/${encodeURIComponent(roomId)}/messages`, { body });
            input.value = '';
        } catch (error) {
            status.textContent = error.message;
        }
    });

    document.getElementById('watch-room-share').addEventListener('click', async event => {
        const button = event.currentTarget;
        try {
            await navigator.clipboard.writeText(window.location.href);
            button.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Link copied';
            window.setTimeout(() => { button.innerHTML = '<i class="fas fa-link" aria-hidden="true"></i> Copy invite link'; }, 1800);
        } catch {
            window.prompt('Copy this watch room link:', window.location.href);
        }
    });

    const endRoomButton = document.getElementById('watch-room-end');
    if (endRoomButton) {
        endRoomButton.addEventListener('click', async () => {
            if (!window.confirm('End this room for everyone?')) return;
            try {
                await requestJson(`/api/watch-rooms/${encodeURIComponent(roomId)}/end`, {});
                closeRoom('The host ended the room.');
            } catch (error) {
                status.textContent = error.message;
            }
        });
    }

    document.querySelectorAll('[data-room-audio-option]').forEach(button => {
        button.addEventListener('click', async () => {
            const selectedAudio = button.dataset.roomAudioOption;
            if (selectedAudio === audio) return;
            button.disabled = true;
            try {
                await requestJson(`/api/watch-rooms/${encodeURIComponent(roomId)}/audio`, {
                    audio: selectedAudio,
                    position: currentPosition,
                    paused
                });
                setRoomAudio(selectedAudio, currentPosition, paused, Date.now());
            } catch (error) {
                status.textContent = error.message;
            } finally {
                button.disabled = false;
            }
        });
    });

    document.getElementById('watch-room-previous')?.addEventListener('click', () => changeRoomEpisode(-1));
    document.getElementById('watch-room-next')?.addEventListener('click', () => changeRoomEpisode(1));

    player.addEventListener('load', () => {
        expectedOrigin = new URL(player.src).origin;
        sendPlayer('autoplay', { on: true });
        sendPlayer('autonext', { on: true });
    });
    window.setTimeout(() => {
        if (!playbackStarted) startButton.hidden = false;
    }, 4000);
});
