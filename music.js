
import { db, authReady } from './auth.js';
import { collection, getDocs, addDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const musicGrid = document.querySelector('.music-grid');
    const selectContainer = document.querySelector(".custom-select-container");
    const adminMusicForm = document.getElementById('admin-music-form');
    const newMusicForm = document.getElementById('new-music-form');
    const categorySelect = document.getElementById('music-category');

    const categories = {
        "all": "All Categories",
        "wedding": "Wedding Songs (Biyah Geet)",
        "chhath": "Chhath Puja Songs",
        "sohar": "Sohar (Childbirth Songs)",
        "bhajan": "Bihari Bhajans",
        "folk": "Classic Bihari Folk",
    };

    // This function now depends on the db object being ready.
    async function loadMusic(filter = 'all') {
        try {
            const q = query(collection(db, "music"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            let musicHTML = '';
            const filteredSongs = querySnapshot.docs.filter(doc => {
                const song = doc.data();
                return filter === 'all' || song.category === filter;
            });

            filteredSongs.forEach(doc => {
                const song = doc.data();
                const videoUrl = `https://www.youtube.com/watch?v=${song.videoId}`;
                musicHTML += `
                    <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="music-card">
                        <img src="https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg" alt="${song.title}" class="music-card-thumbnail">
                        <div class="music-card-content">
                            <p class="music-card-category">${categories[song.category]}</p>
                            <h3 class="music-card-title">${song.title}</h3>
                            <p class="text-gray-400 text-sm">${song.description}</p>
                        </div>
                    </a>
                `;
            });
            musicGrid.innerHTML = musicHTML;
        } catch (error) {
            console.error("Error loading music: ", error);
            musicGrid.innerHTML = `<p class="text-red-500">Failed to load music. Please check the console for details.</p>`;
        }
    }

    function setupDropdowns() {
        if (!selectContainer) return;
        const selected = selectContainer.querySelector(".select-selected");
        const itemsContainer = selectContainer.querySelector(".select-items");
        itemsContainer.innerHTML = '';

        for (const categoryKey in categories) {
            const option = document.createElement('div');
            option.dataset.value = categoryKey;
            option.textContent = categories[categoryKey];
            itemsContainer.appendChild(option);
        }

        itemsContainer.querySelectorAll("div").forEach(item => {
            item.addEventListener("click", function() {
                const category = this.dataset.value;
                selected.innerHTML = this.innerHTML;
                itemsContainer.classList.add("select-hide");
                selected.classList.remove("select-arrow-active");
                loadMusic(category);
            });
        });

        // Also populate the admin form dropdown
        if (categorySelect) {
            categorySelect.innerHTML = '';
            for (const categoryKey in categories) {
                if (categoryKey !== 'all') {
                    const selectOption = document.createElement('option');
                    selectOption.value = categoryKey;
                    selectOption.textContent = categories[categoryKey];
                    categorySelect.appendChild(selectOption);
                }
            }
        }
    }

    if (newMusicForm) {
        newMusicForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newSong = {
                title: document.getElementById('music-title').value,
                videoId: document.getElementById('music-video-id').value,
                category: document.getElementById('music-category').value,
                description: document.getElementById('music-description').value,
                createdAt: new Date()
            };

            try {
                await addDoc(collection(db, "music"), newSong);
                newMusicForm.reset();
                loadMusic(); // Refresh the list
            } catch (error) {
                console.error("Error adding music: ", error);
                alert("Error adding music. Please check the console.");
            }
        });
    }

    // --- The Fix: Wait for Firebase to be ready --- //
    authReady.then(authData => {
        // Now we are sure `db` is initialized.
        console.log('Firebase is ready. Auth data:', authData);

        // 1. Setup UI elements that depend on data
        setupDropdowns();

        // 2. Load initial data
        loadMusic();

        // 3. Show admin controls if applicable
        if (authData && authData.isAdmin) {
            if (adminMusicForm) {
                adminMusicForm.style.display = 'block';
            }
        }
    }).catch(error => {
        console.error("Fatal Error: Firebase initialization failed.", error);
        if (musicGrid) {
            musicGrid.innerHTML = `<p class="text-red-500">Fatal Error: Could not connect to the database.</p>`;
        }
    });
});
