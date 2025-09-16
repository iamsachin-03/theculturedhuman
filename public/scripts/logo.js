
function createLogo() {
    const logoSVG = `
        <svg_code viewBox="0 0 100 100" class="logo-svg">
            <defs>
                <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color: var(--primary-color); stop-opacity: 1" />
                    <stop offset="100%" style="stop-color: var(--primary-color); stop-opacity: 0.8" />
                </linearGradient>
            </defs>
            <path
                d="M50 2 C23.49 2 2 23.49 2 50 C2 76.51 23.49 98 50 98 C76.51 98 98 76.51 98 50 C98 23.49 76.51 2 50 2 Z M50 90 C27.94 90 10 72.06 10 50 C10 27.94 27.94 10 50 10 C72.06 10 90 27.94 90 50 C90 72.06 72.06 90 50 90 Z"
                fill="url(#logo-gradient)"
            />
            <path
                d="M50,25 C62.43,25 72.5,35.07 72.5,47.5 C72.5,59.93 62.43,70 50,70 C37.57,70 27.5,59.93 27.5,47.5 C27.5,35.07 37.57,25 50,25 Z M50,62 C57.99,62 64.5,55.49 64.5,47.5 C64.5,39.51 57.99,33 50,33 C42.01,33 35.5,39.51 35.5,47.5 C35.5,55.49 42.01,62 50,62 Z"
                fill="url(#logo-gradient)"
            />
            <path
                d="M50 20 L50 80"
                stroke="var(--primary-color)"
                stroke-width="3"
                stroke-linecap="round"
            />
        </svg_code>
    `;

    const logoContainers = document.querySelectorAll('.logo-container');
    logoContainers.forEach(container => {
        container.innerHTML = logoSVG;
    });
}

createLogo();
