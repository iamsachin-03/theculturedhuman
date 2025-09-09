
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
*   **Culture Page (`culture.html`):** A deep dive into Bihari culture.
*   **Fitness Page (`fitness.html`):** A page dedicated to traditional Bihari wellness practices and a weekly workout planner.
*   **Marketplace Page (`marketplace.html`):** A "coming soon" page for a marketplace.
*   **Manch Page (`manch.html`):** A blog/forum for the community.
    *   **Admin Controls:** Admins have exclusive access to a form to create, edit, and delete posts.
    *   **Post Display:** All posts are displayed in a visually appealing grid, fetched from Firestore.
*   **About Page (`about.html`):** Information about the vision and mission of Bihar Angan.
*   **Authentication (`auth.js`):** A robust authentication system using Firebase. It correctly handles user sessions and custom claims (like admin status) via an `authReady` promise, which acts as a single source of truth for the user's authentication state.
*   **Proverbs Page (`proverbs.js`):** A feature displaying Bihari proverbs, with an admin-only form to add new ones. This feature now works correctly by waiting for the `authReady` signal.

## Current Plan: Implement Navigation

I have implemented the navigation bar across all pages of the website. This was a multi-step process that involved:

1.  **Identifying the correct files:** I located all the HTML files that make up the website.
2.  **Updating the navigation bar:** I added the "Fitness" and "Marketplace" links to the navigation bar in each HTML file.
3.  **Ensuring consistency:** I renamed the "Bazaar" link to "Marketplace" to ensure consistency across the website.
