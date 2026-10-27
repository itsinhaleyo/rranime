document.addEventListener('DOMContentLoaded', () => {
    const slider = document.querySelector('.hero-slider');
    if (!slider) return;

    const slides = Array.from(slider.querySelectorAll('.slide'));
    const dots = Array.from(slider.querySelectorAll('.spotlight-dot'));
    if (slides.length < 2) return;

    let currentIndex = Math.max(0, slides.findIndex(slide => slide.classList.contains('is-active')));
    let timer = null;
    let touchStartX = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function showSlide(index) {
        currentIndex = (index + slides.length) % slides.length;
        slides.forEach((slide, slideIndex) => {
            const active = slideIndex === currentIndex;
            slide.classList.toggle('is-active', active);
            slide.setAttribute('aria-hidden', String(!active));
        });
        dots.forEach((dot, dotIndex) => {
            const active = dotIndex === currentIndex;
            dot.classList.toggle('is-active', active);
            dot.setAttribute('aria-current', active ? 'true' : 'false');
        });
    }

    function stopTimer() {
        if (timer) window.clearInterval(timer);
        timer = null;
    }

    function startTimer() {
        stopTimer();
        if (!reducedMotion) {
            timer = window.setInterval(() => showSlide(currentIndex + 1), 7000);
        }
    }

    slider.querySelectorAll('[data-slide-direction]').forEach(button => {
        button.addEventListener('click', () => {
            showSlide(currentIndex + Number(button.dataset.slideDirection));
            startTimer();
        });
    });

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            showSlide(Number(dot.dataset.slideTo));
            startTimer();
        });
    });

    slider.addEventListener('mouseenter', stopTimer);
    slider.addEventListener('mouseleave', startTimer);
    slider.addEventListener('focusin', stopTimer);
    slider.addEventListener('focusout', event => {
        if (!slider.contains(event.relatedTarget)) startTimer();
    });

    slider.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') {
            showSlide(currentIndex - 1);
            startTimer();
        } else if (event.key === 'ArrowRight') {
            showSlide(currentIndex + 1);
            startTimer();
        }
    });

    slider.addEventListener('touchstart', event => {
        touchStartX = event.changedTouches[0].clientX;
        stopTimer();
    }, { passive: true });

    slider.addEventListener('touchend', event => {
        if (touchStartX === null) return;
        const deltaX = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(deltaX) > 45) showSlide(currentIndex + (deltaX < 0 ? 1 : -1));
        touchStartX = null;
        startTimer();
    }, { passive: true });

    startTimer();
});
