
import { db, authReady } from './auth.js';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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

    let allMusic = []; // Cache for all music tracks

    function renderMusic(filter = 'all') {
        if (!musicGrid) return;
        const filteredMusic = filter === 'all' 
            ? allMusic 
            : allMusic.filter(song => song.category === filter);

        musicGrid.innerHTML = '';
        if (filteredMusic.length === 0) {
            musicGrid.innerHTML = `<p class="text-center text-gray-400 col-span-full">No music found in this category.</p>`;
            return;
        }

        filteredMusic.forEach(song => {
            const videoUrl = `https://www.youtube.com/watch?v=${song.videoId}`;
            const card = document.createElement('a');
            card.href = videoUrl;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            card.className = 'music-card';
            card.innerHTML = `
                <img src="https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg" alt="${song.title}" class="music-card-thumbnail">
                <div class="music-card-content">
                    <p class="music-card-category">${categories[song.category] || 'General'}</p>
                    <h3 class="music-card-title">${song.title}</h3>
                    <p class="text-gray-400 text-sm">${song.description || ''}</p>
                </div>
            `;
            musicGrid.appendChild(card);
        });
    }

    async function fetchMusic() {
        try {
            const q = query(collection(db, "music"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            allMusic = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderMusic(); // Render all music initially
        } catch (error) {
            console.error("Error loading music: ", error);
            if (musicGrid) musicGrid.innerHTML = `<p class="text-red-500">Failed to load music.</p>`;
        }
    }

    function setupDropdown() {
        if (!selectContainer) return;
        const selected = selectContainer.querySelector(".select-selected");
        const itemsContainer = selectContainer.querySelector(".select-items");
        
        itemsContainer.innerHTML = '';
        Object.keys(categories).forEach(key => {
            const option = document.createElement('div');
            option.dataset.value = key;
            option.textContent = categories[key];
            itemsContainer.appendChild(option);
        });

        selected.addEventListener("click", (e) => {
            e.stopPropagation();
            itemsContainer.classList.toggle("select-hide");
            selected.classList.toggle("select-arrow-active");
        });

        itemsContainer.querySelectorAll("div").forEach(item => {
            item.addEventListener("click", function() {
                selected.textContent = this.textContent;
                renderMusic(this.dataset.value);
            });
        });

        document.addEventListener("click", () => {
            itemsContainer.classList.add("select-hide");
            selected.classList.remove("select-arrow-active");
        });

        if (categorySelect) {
            categorySelect.innerHTML = '';
            Object.keys(categories).forEach(key => {
                if (key !== 'all') {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = categories[key];
                    categorySelect.appendChild(option);
                }
            });
        }
    }

    if (newMusicForm) {
        newMusicForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await addDoc(collection(db, "music"), {
                    title: document.getElementById('music-title').value,
                    videoId: document.getElementById('music-video-id').value,
                    category: document.getElementById('music-category').value,
                    description: document.getElementById('music-description').value,
                    createdAt: serverTimestamp()
                });
                newMusicForm.reset();
                fetchMusic(); // Refresh the list after adding
            } catch (error) {
                console.error("Error adding music: ", error);
                alert("Error adding music. Please check the console.");
            }
        });
    }

    authReady.then(authData => {
        console.log('Firebase is ready on Music page. Auth data:', authData);
        setupDropdown();
        fetchMusic();
        if (authData && authData.isAdmin) {
            if (adminMusicForm) adminMusicForm.style.display = 'block';
        }
    }).catch(error => {
        console.error("Fatal Error: Firebase initialization failed on Music page.", error);
        if (musicGrid) musicGrid.innerHTML = `<p class="text-red-500">Fatal Error: Could not connect to the database.</p>`;
    });
});
