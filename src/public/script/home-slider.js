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
    let transitionTimer = null;

    function showSlide(index, direction = index > currentIndex ? 1 : -1) {
        const nextIndex = (index + slides.length) % slides.length;
        if (nextIndex === currentIndex) return;
        const previousIndex = currentIndex;
        const previousSlide = slides[previousIndex];
        const nextSlide = slides[nextIndex];
        currentIndex = nextIndex;

        if (transitionTimer) window.clearTimeout(transitionTimer);
        slides.forEach(slide => slide.classList.remove('is-entering-from-left', 'is-entering-from-right', 'is-leaving-left', 'is-leaving-right'));

        if (!reducedMotion) {
            const enteringClass = direction > 0 ? 'is-entering-from-right' : 'is-entering-from-left';
            const leavingClass = direction > 0 ? 'is-leaving-left' : 'is-leaving-right';
            nextSlide.classList.add(enteringClass);
            nextSlide.classList.add('is-active');
            void nextSlide.offsetWidth;
            nextSlide.classList.remove(enteringClass);
            previousSlide.classList.remove('is-active');
            previousSlide.classList.add(leavingClass);

            const finishTransition = () => {
                if (transitionTimer) window.clearTimeout(transitionTimer);
                transitionTimer = null;
                previousSlide.classList.remove(leavingClass);
            };
            previousSlide.addEventListener('transitionend', event => {
                if (event.propertyName === 'transform') finishTransition();
            }, { once: true });
            transitionTimer = window.setTimeout(finishTransition, 550);
        } else {
            previousSlide.classList.remove('is-active');
            nextSlide.classList.add('is-active');
        }

        slides.forEach((slide, slideIndex) => {
            slide.setAttribute('aria-hidden', String(slideIndex !== currentIndex));
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
            const direction = Number(button.dataset.slideDirection);
            showSlide(currentIndex + direction, direction);
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
            showSlide(currentIndex - 1, -1);
            startTimer();
        } else if (event.key === 'ArrowRight') {
            showSlide(currentIndex + 1, 1);
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
        if (Math.abs(deltaX) > 45) {
            const direction = deltaX < 0 ? 1 : -1;
            showSlide(currentIndex + direction, direction);
        }
        touchStartX = null;
        startTimer();
    }, { passive: true });

    startTimer();
});
