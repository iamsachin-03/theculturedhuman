document.addEventListener('DOMContentLoaded', function() {
    const logoContainers = document.querySelectorAll('.logo-container');
    logoContainers.forEach(container => {
        container.innerHTML = `
            <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="sunGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color: #FFD700; stop-opacity: 1" />
                        <stop offset="100%" style="stop-color: #FF8C00; stop-opacity: 1" />
                    </linearGradient>
                    <filter id="sunGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                     <style>
                        #sun-symbol {
                            /* Defines the center and animation for a subtle pulse */
                            transform-origin: 60px 65px;
                            animation: pulse-animation 4s ease-in-out infinite alternate;
                        }
                        @keyframes pulse-animation {
                            from { transform: scale(0.98); }
                            to { transform: scale(1.02); }
                        }
                    </style>
                </defs>

                <!-- Traditional Bihari Gateway -->
                <path d="M20,110 L20,60 C20,30 100,30 100,60 L100,110 L90,110 L90,65 C90,45 30,45 30,65 L30,110 Z" fill="var(--primary-color)"/>

                <!-- Rising Sun Symbol -->
                <g id="sun-symbol">
                    <circle cx="60" cy="65" r="28" fill="url(#sunGradient)" filter="url(#sunGlow)"/>
                    <text x="60" y="70"
                          font-family="'Playfair Display', serif"
                          font-size="24"
                          font-weight="700"
                          fill="#4A2511"
                          text-anchor="middle"
                          dominant-baseline="middle">BA</text>
                </g>
            </svg>
        `;
    });
});
