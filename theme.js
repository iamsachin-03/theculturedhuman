
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleButton = document.getElementById('theme-toggle');
    const sunIcon = document.getElementById('theme-toggle-sun');
    const moonIcon = document.getElementById('theme-toggle-moon');

    // On page load or when changing themes, apply the saved theme
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    } else {
        document.body.classList.remove('light-mode');
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    }

    themeToggleButton.addEventListener('click', () => {
        // toggle the theme
        document.body.classList.toggle('light-mode');

        // update the icon
        sunIcon.classList.toggle('hidden');
        moonIcon.classList.toggle('hidden');

        // save the new theme to local storage
        if (document.body.classList.contains('light-mode')) {
            localStorage.setItem('theme', 'light');
        } else {
            localStorage.removeItem('theme');
        }
    });
});
