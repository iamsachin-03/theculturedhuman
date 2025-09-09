
# Bihar Angan: A Digital Ecosystem for Bihar

**Bihar Angan** is a web platform designed to be a digital courtyard for Bihar, fostering community, culture, and commerce. It serves as a media house, a cultural embassy, and a community marketplace, all in one.

## Project Outline

### Style & Design

*   **Theme:** A dual-mode light and dark theme, with a primary color of antique gold in dark mode and a rich brown in light mode. The theme is toggled with a sun/moon icon in the header.
*   **Fonts:** Playfair Display for headings, Poppins for body text.
*   **Logo:** A stylized SVG logo that is dynamically themed with the current primary color.
*   **Layout:** Responsive and mobile-first, using Tailwind CSS and modern CSS features like container queries and logical properties.
*   **Visual Flair:** Subtle background patterns, glowing button effects, and layered drop shadows create a premium, interactive feel.
*   **Animation:** A simple, elegant, and culturally relevant animation on the home page that showcases Bihar's rich culture.

### Features

*   **Home Page (`index.html`):** A landing page introducing the three pillars of Bihar Angan: Culture, Commerce, and Community. The page also features an animation that showcases Bihar's rich culture.
*   **Culture Page (`culture.html`):** A deep dive into Bihari culture, with a new dropdown menu in the navigation bar that links to the Music, Bazaar, and Proverbs pages.
*   **Music Page (`music.html`):** A curated collection of Bihari folk music, categorized by genre. The page features a dropdown menu to select a category and a grid view of individual songs. An admin-only form allows adding new music, which is stored in Firestore. The logic is handled by `music.js`.
*   **Bazaar Page (`bazaar.html`):** A visually rich gallery of traditional Bihari crafts. The page features a hero section and a responsive grid of product cards, each with a high-quality image and description.
*   **Fitness Page (`fitness.html`):** A page dedicated to traditional Bihari wellness practices and a weekly workout planner.
*   **Marketplace Page (`marketplace.html`):** A "coming soon" page for a marketplace.
*   **Manch Page (`manch.html`):** A blog/forum for the community.
    *   **Admin Controls:** Admins have exclusive access to a form to create, edit, and delete posts.
    *   **Post Display:** All posts are displayed in a visually appealing grid, fetched from Firestore.
*   **About Page (`about.html`):** Information about the vision and mission of Bihar Angan.
*   **Authentication (`auth.js`):** A robust authentication system using Firebase Email Link (passwordless) sign-in. It correctly handles user sessions and custom claims (like admin status) via an `authReady` promise, which acts as a single source of truth for the user's authentication state. The flow involves sending a secure link to the user's email, which they click to sign in.
*   **Proverbs Page (`proverbs.js`):** A feature displaying Bihari proverbs, with an admin-only form to add new ones. This feature now works correctly by waiting for the `authReady` signal.

## Current Plan: Music Page Admin Form

*   **Goal:** Add an admin-only form to the `music.html` page to allow adding new music. The music data will be stored in Firestore.
*   **Features:**
    *   An admin-only form to add new music with fields for YouTube Video ID, Title, Category, and Description.
    *   The form is hidden by default and only visible to users with admin privileges.
    *   The music data is fetched from and saved to Firestore.
    *   The logic for fetching, displaying, and adding music is handled by `music.js`.
