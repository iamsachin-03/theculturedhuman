
# Bihar Angan: A Digital Ecosystem for Bihar

**Bihar Angan** is a web platform designed to be a digital courtyard for Bihar, fostering community, culture, and commerce. It serves as a media house, a cultural embassy, and a community marketplace, all in one.

## Project Outline

### Style & Design

*   **Theme:** A dual-mode light and dark theme, with a primary color of antique gold in dark mode and a rich brown in light mode. The theme is toggled with a sun/moon icon in the header.
*   **Fonts:** Playfair Display for headings, Poppins for body text.
*   **Logo:** A stylized SVG logo that is dynamically themed with the current primary color.
*   **Layout:** Responsive and mobile-first, using Tailwind CSS and modern CSS features like container queries and logical properties.
*   **Visual Flair:** Subtle background patterns, glowing button effects, and layered drop shadows create a premium, interactive feel.

### Features

*   **Home Page (`index.html`):** A landing page introducing the three pillars of Bihar Angan: Culture, Commerce, and Community.
*   **Culture Page (`culture.html`):** A deep dive into Bihari culture, with a new dropdown menu in the navigation bar that links to the Music, Bazaar, and Proverbs pages.
*   **Music Page (`music.html`):** A curated collection of Bihari folk music, categorized by genre. The page features a dropdown menu to select a category and a grid view of individual songs. To work around YouTube's embedding restrictions, clicking a song card now opens the video in a new browser tab.
*   **Bazaar Page (`bazaar.html`):** A visually rich gallery of traditional Bihari crafts. The page features a hero section and a responsive grid of product cards, each with a high-quality image and description.
*   **Fitness Page (`fitness.html`):** A page dedicated to traditional Bihari wellness practices and a weekly workout planner.
*   **Marketplace Page (`marketplace.html`):** A "coming soon" page for a marketplace.
*   **Manch Page (`manch.html`):** A blog/forum for the community.
    *   **Admin Controls:** Admins have exclusive access to a form to create, edit, and delete posts.
    *   **Post Display:** All posts are displayed in a visually appealing grid, fetched from Firestore.
*   **About Page (`about.html`):** Information about the vision and mission of Bihar Angan.
*   **Authentication (`auth.js`):** A robust authentication system using Firebase Email Link (passwordless) sign-in. It correctly handles user sessions and custom claims (like admin status) via an `authReady` promise, which acts as a single source of truth for the user's authentication state. The flow involves sending a secure link to the user's email, which they click to sign in.
*   **Proverbs Page (`proverbs.js`):** A feature displaying Bihari proverbs, with an admin-only form to add new ones. This feature now works correctly by waiting for the `authReady` signal.

## Current Plan: Build the Proverbs Page

*   **Goal:** Create the `proverbs.html` page, which will display a collection of Bihari proverbs. It will also include a form that is only visible to admins, allowing them to add new proverbs to the collection.
*   **Features:**
    *   A hero section with a relevant background image and an inspiring title.
    *   A responsive grid or list to display the proverbs.
    *   An admin-only form to add new proverbs, which will be stored in Firestore.
    *   The page will be styled to match the rest of the site, using the existing `style.css` and the project's design language.
