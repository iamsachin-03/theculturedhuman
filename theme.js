document.addEventListener('DOMContentLoaded', () => {
    const themeToggleButton = document.getElementById('theme-toggle');
    const sunIcon = document.getElementById('theme-toggle-sun');
    const moonIcon = document.getElementById('theme-toggle-moon');

    // Stop the script if any of the necessary elements are not on the page.
    if (!themeToggleButton || !sunIcon || !moonIcon) {
        return; // Exit gracefully if this isn't a page with a theme toggler.
    }

    const applyTheme = () => {
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light-mode');
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        } else {
            document.body.classList.remove('light-mode');
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }
    };

    const toggleTheme = () => {
        document.body.classList.toggle('light-mode');
        sunIcon.classList.toggle('hidden');
        moonIcon.classList.toggle('hidden');

        if (document.body.classList.contains('light-mode')) {
            localStorage.setItem('theme', 'light');
        } else {
            localStorage.removeItem('theme');
        }
    };

    // Initial theme application
    applyTheme();

    // Event listener
    themeToggleButton.addEventListener('click', toggleTheme);
});
