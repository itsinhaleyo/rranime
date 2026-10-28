document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.estimated-schedule').forEach(schedule => {
        const tabs = Array.from(schedule.querySelectorAll('[role="tab"]'));
        const panels = Array.from(schedule.querySelectorAll('[role="tabpanel"]'));

        const activateTab = index => {
            tabs.forEach((tab, tabIndex) => {
                const isActive = tabIndex === index;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', String(isActive));
                tab.tabIndex = isActive ? 0 : -1;
                panels[tabIndex].hidden = !isActive;
            });
        };

        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => activateTab(index));
            tab.addEventListener('keydown', event => {
                let nextIndex;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
                else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = tabs.length - 1;
                else return;

                event.preventDefault();
                activateTab(nextIndex);
                tabs[nextIndex].focus();
            });
        });
    });
});
