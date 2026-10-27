document.addEventListener("DOMContentLoaded", () => {
    const theaterWrapper = document.querySelector(".video-theater-wrapper");
    const embedPlayer = document.getElementById("rranime-embed-player");
    if (!theaterWrapper || !embedPlayer) {
        console.warn("Required player components or streaming metadata fields were missing in the DOM.");
        return;
    }
    const malId = theaterWrapper.dataset.malId;
    const anilistId = theaterWrapper.dataset.anilistId;
    const currentEpisode = theaterWrapper.dataset.currentEpisode;
    const audioToggleButtons = document.querySelectorAll(".audio-toggle");
    audioToggleButtons.forEach(button => {
        button.addEventListener("click", function() {
            audioToggleButtons.forEach(btn => btn.classList.remove("active"));
            audioToggleButtons.forEach(btn => btn.setAttribute("aria-pressed", "false"));
            this.classList.add("active");
            this.setAttribute("aria-pressed", "true");
            const language = this.dataset.audio;
            const provider = this.dataset.provider;
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
        });
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
