
# Project Blueprint: The Cultured Human

## Overview

"The Cultured Human" is a modern, responsive web application designed to be a sanctuary for personal growth, balancing physical fitness, cultural immersion, and mindful living. Inspired by the rich heritage of Bihar, the platform offers users a holistic path to self-improvement. It is built with a framework-less approach, leveraging modern HTML, CSS, and JavaScript, with a focus on Web Components for reusability and a clean, elegant aesthetic.

## Style & Design

- **Typography:** A blend of 'Playfair Display' for bold, elegant headings and 'Poppins' for clean, readable body text.
- **Color Palette:** A sophisticated, dual-theme system (light and dark modes) provides a high-contrast, visually appealing experience.
    - **Dark Mode:** Deep black backgrounds (`#121212`), off-black cards (`#1E1E1E`), and a rich, antique gold accent (`#D4AF37`) create a luxurious feel.
    - **Light Mode:** A clean, light-gray background (`#F8F9FA`), pure white cards (`#FFFFFF`), and an earthy brown accent (`#8B4513`) provide a warm, inviting feel.
- **Layout:** Clean, spacious, and responsive, utilizing a 12-column grid system for consistency. Ample whitespace and a strong visual hierarchy guide the user.
- **Iconography:** Font Awesome is used for icons, including a sun/moon toggle for theme switching.
- **Effects:** Subtle animations like `fadeInUp` and gentle transformations on hover create a dynamic and engaging user experience.

## Features

- **User Authentication:** A complete authentication system allows users to sign up, log in, and log out. It supports both email/password and Google Sign-In. The navigation bar dynamically updates across the entire site to show the user's status, displaying their name and a logout button when logged in, or a login link when logged out.
- **Dual-Theme System:** A prominent, site-wide theme toggle allows users to switch between a stunning dark mode and a clean light mode. The user's preference is saved in `localStorage` for a persistent experience.
- **Responsive Design:** The application is fully responsive, providing an optimal viewing experience across all devices, from mobile to desktop.
- **Modular Code:** The use of ES Modules for JavaScript (`auth.js`, `theme.js`, `blog.js`) ensures that the codebase is clean, maintainable, and scalable.
- **Blog Functionality:** A full-featured blog with a grid layout, tag-based filtering, client-side pagination, and an in-tab post preview modal. Includes a basic admin view to show a "Create Post" button.

## Pages & Functionality

- **`index.html` (Home):** The landing page, featuring a powerful hero section, an introduction to the three pillars (Body, Spirit, Mind), and a featured content section.
- **`fitness.html` (Fitness):** A dedicated page for the fitness pillar, outlining a 6-day workout regimen with an interactive tab-based navigation to view the plan for each day.
- **`culture.html` (Culture):** An immersive page exploring the rich culture of Bihar, including sections on festivals, cuisine, traditional attire, and more.
- **`about.html` (About):** Explains the philosophy behind "The Cultured Human," detailing the importance of balancing body, mind, and spirit.
- **`marketplace.html` (Marketplace):** A "coming soon" page for a future e-commerce platform that will connect Bihari artisans with a global audience. Includes waitlist signup forms for both buyers and sellers.
- **`music.html` (Music):** A page dedicated to Bihari folk music, featuring an interactive grid and playlist viewer for different music categories.
- **`proverbs.html` (Proverbs):** A comprehensive collection of timeless proverbs from Bihar, offering insights into its culture and values.
- **`auth.html` (Authentication):** A dedicated page for user sign-up and login, with a clean UI, form toggling between login and sign-up, and an option for Google Sign-In.
- **`blog.html` (Blog):** A new page to display a grid of blog articles, complete with a preview modal, pagination, and tag filtering. Includes an admin-only "Create Post" button.

## Technical Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Styling:** Tailwind CSS for utility classes, augmented with custom CSS for theming and advanced styling.
- **JavaScript Libraries:** None. The project prioritizes modern, vanilla JavaScript.
- **Fonts:** Google Fonts (Playfair Display, Poppins).
- **Icons:** Font Awesome.
- **Backend:** Firebase Authentication for user management.

## Current Task: Implement Blog Page

**Plan:**

1.  **Create `blog.html`:** A new page to display a grid of blog articles, complete with a preview modal, pagination, and tag filtering. (Completed)
2.  **Create `blog.js`:** A dedicated script to dynamically load and manage blog content, including rendering posts, handling post previews, and managing pagination and filtering. (Completed)
3.  **Add Admin Features:** Include a simple, admin-only "Create Post" button that will lead to a future form for content creation. (Completed)
4.  **Update Navigation:** Add a "Blog" link to the main navigation bar on all existing pages to ensure seamless site-wide integration. (Completed)
5.  **Update Blueprint:** Update the `blueprint.md` file to document the new blog functionality, its features, and the plan for future admin and user interaction capabilities. (Completed)

**Next Steps:**

1.  **Blog Backend Integration:** Replace the sample data in `blog.js` with calls to a Firebase Firestore database to fetch and display blog posts dynamically.
2.  **Admin Post Creation:** Create a new `create-post.html` page with a form that allows admins to write and publish new blog articles directly to Firestore.
3.  **User Interaction:** Implement comment sections and like buttons on blog posts, storing and retrieving data from Firestore.
4.  **Firebase Configuration:** The placeholder Firebase credentials in `auth.js` must be replaced with a real Firebase project configuration to enable all Firebase-related features.
