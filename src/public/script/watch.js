document.addEventListener("DOMContentLoaded", () => {
    const theaterWrapper = document.querySelector(".video-theater-wrapper");
    const embedPlayer = document.getElementById("rranime-embed-player");
    if (!theaterWrapper || !embedPlayer) {
        console.warn("Required player components or streaming metadata fields were missing in the DOM.");
        return;
    }
    const malId = theaterWrapper.dataset.malId;
    const anilistId = theaterWrapper.dataset.anilistId;
    const currentEpisode = Number(theaterWrapper.dataset.currentEpisode);
    const totalEpisodes = Number(theaterWrapper.dataset.totalEpisodes);
    let activeProvider = theaterWrapper.dataset.currentProvider || "zoko";
    let activeAudio = theaterWrapper.dataset.currentAudio || "sub";
    let expectedPlayerOrigin = new URL(embedPlayer.src).origin;
    let advanceTriggered = false;
    const audioToggleButtons = document.querySelectorAll(".audio-toggle");
    const shareEpisodeButton = document.getElementById("share-episode-link");
    const watchTogetherStatus = document.getElementById("watch-together-status");
    if (shareEpisodeButton && watchTogetherStatus) {
        shareEpisodeButton.addEventListener("click", async () => {
            const episodeUrl = new URL(window.location.href);
            episodeUrl.pathname = `/anime/${encodeURIComponent(malId)}/${encodeURIComponent(currentEpisode)}`;
            episodeUrl.search = new URLSearchParams({ provider: activeProvider, audio: activeAudio }).toString();
            episodeUrl.hash = "";
            const shareTitle = shareEpisodeButton.dataset.shareTitle || "Watch this episode with me";

            if (navigator.share) {
                try {
                    await navigator.share({ title: shareTitle, text: "Join me for this episode on RRAnime.", url: episodeUrl.href });
                    watchTogetherStatus.hidden = false;
                    watchTogetherStatus.textContent = "Episode invite shared.";
                    return;
                } catch (error) {
                    if (error.name === "AbortError") return;
                }
            }

            try {
                await navigator.clipboard.writeText(episodeUrl.href);
                watchTogetherStatus.textContent = "Episode link copied. Share it with your friends.";
            } catch {
                window.prompt("Copy this episode link to invite a friend:", episodeUrl.href);
                watchTogetherStatus.textContent = "Copy the episode link to invite a friend.";
            }
            watchTogetherStatus.hidden = false;
        });
    }
    const nextAiringPanel = document.querySelector(".next-airing-panel");
    if (nextAiringPanel) {
        const nextAiringAt = Number(nextAiringPanel.dataset.airingAt) * 1000;
        const localTime = document.getElementById("next-airing-local-time");
        const countdown = document.getElementById("next-airing-countdown");
        if (localTime && Number.isFinite(nextAiringAt)) {
            localTime.textContent = new Date(nextAiringAt).toLocaleString();
        }
        const updateCountdown = () => {
            const remaining = Math.max(0, Math.floor((nextAiringAt - Date.now()) / 1000));
            if (remaining === 0) {
                countdown.textContent = "Expected now";
                window.clearInterval(countdownTimer);
                return;
            }
            const days = Math.floor(remaining / 86400);
            const hours = Math.floor((remaining % 86400) / 3600);
            const minutes = Math.floor((remaining % 3600) / 60);
            const seconds = remaining % 60;
            const pad = value => String(value).padStart(2, "0");
            countdown.textContent = days > 0
                ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
                : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        };
        const countdownTimer = window.setInterval(updateCountdown, 1000);
        updateCountdown();
    }

    audioToggleButtons.forEach(button => {
        button.addEventListener("click", function() {
            audioToggleButtons.forEach(btn => btn.classList.remove("active"));
            audioToggleButtons.forEach(btn => btn.setAttribute("aria-pressed", "false"));
            this.classList.add("active");
            this.setAttribute("aria-pressed", "true");
            const language = this.dataset.audio;
            const provider = this.dataset.provider;
            activeProvider = provider;
            activeAudio = language;
            advanceTriggered = false;
            let finalizedStreamUrl;

            if (provider === "anixo") {
                if (!anilistId) return;
                finalizedStreamUrl = `https://anixo.buzz/embed/ani/${encodeURIComponent(anilistId)}/${encodeURIComponent(currentEpisode)}/${encodeURIComponent(language)}?color=%23e63946`;
            } else if (provider === "megavid") {
                const idType = malId ? "mal" : "ani";
                const id = malId || anilistId;
                if (!id) return;
                finalizedStreamUrl = `https://megavid.buzz/${idType}/${encodeURIComponent(id)}/${encodeURIComponent(currentEpisode)}/${encodeURIComponent(language)}?color=%23e63946&autoplay=true`;
            } else {
                finalizedStreamUrl = `https://zokoanime.video/stream/mal/${encodeURIComponent(malId)}/${encodeURIComponent(currentEpisode)}/${encodeURIComponent(language)}?color=ff3c20`;
            }

            embedPlayer.src = finalizedStreamUrl;
            expectedPlayerOrigin = new URL(finalizedStreamUrl).origin;
        });
    });

    function isCompletionMessage(rawMessage) {
        let data = rawMessage;
        if (typeof data === "string") {
            try {
                data = JSON.parse(data);
            } catch {
                return false;
            }
        }
        if (!data || typeof data !== "object") return false;
        const eventNames = [data.event, data.type, data.action, data.name, data.status]
            .filter(value => typeof value === "string")
            .map(value => value.toLowerCase());
        return eventNames.some(name => ["complete", "completed", "ended", "finished", "video_ended"].includes(name));
    }

    window.addEventListener("message", event => {
        if (event.source !== embedPlayer.contentWindow || event.origin !== expectedPlayerOrigin) return;
        if (!isCompletionMessage(event.data) || advanceTriggered) return;
        if (!Number.isSafeInteger(currentEpisode) || !Number.isSafeInteger(totalEpisodes) || currentEpisode >= totalEpisodes) return;

        advanceTriggered = true;
        const nextEpisode = currentEpisode + 1;
        const nextUrl = `/anime/${encodeURIComponent(malId)}/${nextEpisode}?provider=${encodeURIComponent(activeProvider)}&audio=${encodeURIComponent(activeAudio)}&autoplay=1`;
        window.location.assign(nextUrl);
    });

    const theaterToggleButton = document.querySelector(".btn-theater-toggle");
    if (theaterToggleButton) {
        theaterToggleButton.addEventListener("click", () => {
            document.body.classList.toggle("theater-mode-dimmed");
            const lightbulbIcon = theaterToggleButton.querySelector("i");
            if (lightbulbIcon) {
                lightbulbIcon.classList.toggle("text-primary");
            }
        });
    }
});
