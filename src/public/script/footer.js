document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.getElementById("mobile-menu-toggle");
    const closeBtn = document.getElementById("mobile-drawer-close-btn");
    const closeMask = document.getElementById("mobile-drawer-close-mask");
    const mobileDrawer = document.getElementById("mobile-sidebar-drawer");
    if (menuToggle && mobileDrawer) {
        const openDrawer = () => { mobileDrawer.classList.add("drawer-open"); document.body.style.overflow = "hidden"; };
        const closeDrawer = () => { mobileDrawer.classList.remove("drawer-open"); document.body.style.overflow = "auto"; };
        menuToggle.addEventListener("click", openDrawer);
        if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
        if (closeMask) closeMask.addEventListener("click", closeDrawer);
    }
});