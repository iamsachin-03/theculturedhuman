
import {
    db,
    authReady,
    collection,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp,
    onSnapshot
} from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const musicGrid = document.querySelector('.music-grid');
    const selectContainer = document.querySelector(".custom-select-container");
    const adminMusicForm = document.getElementById('admin-music-form');
    const newMusicForm = document.getElementById('new-music-form');
    const addCategorySelect = document.getElementById('music-category');
    
    // Edit Modal Elements
    const editMusicModal = document.getElementById('edit-music-modal');
    const editMusicForm = document.getElementById('edit-music-form');
    const cancelEditButton = document.getElementById('cancel-edit-music-button');
    const editCategorySelect = document.getElementById('edit-music-category');

    // --- State ---
    const categories = {
        "all": "All Categories",
        "wedding": "Wedding Songs (Biyah Geet)",
        "chhath": "Chhath Puja Songs",
        "sohar": "Sohar (Childbirth Songs)",
        "bhajan": "Bihari Bhajans",
        "folk": "Classic Bihari Folk",
    };
    let allMusic = []; // Cache for all music tracks
    let isAdmin = false;
    let currentFilter = 'all';

    // --- Functions ---

    function renderMusic() {
        if (!musicGrid) return;
        const filteredMusic = currentFilter === 'all' 
            ? allMusic 
            : allMusic.filter(song => song.category === currentFilter);

        musicGrid.innerHTML = '';
        if (filteredMusic.length === 0) {
            musicGrid.innerHTML = `<p class="text-center text-gray-400 col-span-full">No music found in this category.</p>`;
            return;
        }

        filteredMusic.forEach(song => {
            const card = document.createElement('div');
            card.className = 'music-card';
            card.innerHTML = `
                <div class="music-card-thumbnail-wrapper">
                    <img src="https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg" alt="${song.title}" class="music-card-thumbnail">
                    <div class="play-overlay"><i class="fas fa-play"></i></div>
                </div>
                <div class="music-card-content">
                    <p class="music-card-category">${categories[song.category] || 'General'}</p>
                    <h3 class="music-card-title">${song.title}</h3>
                    <p class="text-gray-400 text-sm">${(song.description || '').substring(0, 80)}...</p>
                </div>
                ${isAdmin ? `
                <div class="card-actions">
                    <button data-id="${song.id}" class="edit-music-btn"><i class="fas fa-pencil-alt"></i></button>
                    <button data-id="${song.id}" class="delete-music-btn"><i class="fas fa-trash-alt"></i></button>
                </div>
                ` : ''}
            `;
            
            const thumbnailWrapper = card.querySelector('.music-card-thumbnail-wrapper');
            thumbnailWrapper.addEventListener('click', () => {
                window.open(`https://www.youtube.com/watch?v=${song.videoId}`, '_blank');
            });
            
            musicGrid.appendChild(card);
        });
    }

    function populateSelect(selectElement) {
        if (!selectElement) return;
        selectElement.innerHTML = '';
        Object.keys(categories).forEach(key => {
            if (key !== 'all') {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = categories[key];
                selectElement.appendChild(option);
            }
        });
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
            item.addEventListener('click', function() {
                selected.textContent = this.textContent;
                itemsContainer.classList.add("select-hide");
                selected.classList.remove("select-arrow-active");
                currentFilter = this.dataset.value;
                renderMusic();
            });
        });
    }

    // --- Event Listeners ---

    if (newMusicForm) {
        newMusicForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await addDoc(collection(db, "music"), {
                    title: document.getElementById('music-title').value,
                    videoId: document.getElementById('music-video-id').value,
                    category: addCategorySelect.value,
                    description: document.getElementById('music-description').value,
                    createdAt: serverTimestamp()
                });
                newMusicForm.reset();
            } catch (error) {
                console.error("Error adding music: ", error);
                alert("Error adding music.");
            }
        });
    }

    musicGrid.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const musicId = target.dataset.id;

        if (target.classList.contains('edit-music-btn')) {
            const songToEdit = allMusic.find(song => song.id === musicId);
            if (songToEdit) {
                document.getElementById('edit-music-id').value = musicId;
                document.getElementById('edit-music-title').value = songToEdit.title;
                document.getElementById('edit-music-video-id').value = songToEdit.videoId;
                editCategorySelect.value = songToEdit.category;
                document.getElementById('edit-music-description').value = songToEdit.description;
                editMusicModal.classList.remove('hidden');
            }
        }

        if (target.classList.contains('delete-music-btn')) {
            if (confirm('Are you sure you want to delete this music track?')) {
                try {
                    await deleteDoc(doc(db, "music", musicId));
                } catch (error) {
                    console.error("Error deleting music: ", error);
                    alert('Error deleting music.');
                }
            }
        }
    });

    editMusicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const musicId = document.getElementById('edit-music-id').value;
        const updatedData = {
            title: document.getElementById('edit-music-title').value,
            videoId: document.getElementById('edit-music-video-id').value,
            category: editCategorySelect.value,
            description: document.getElementById('edit-music-description').value,
        };

        try {
            const musicRef = doc(db, "music", musicId);
            await updateDoc(musicRef, updatedData);
            editMusicModal.classList.add('hidden');
        } catch (error) {
            console.error("Error updating music: ", error);
            alert('Error updating music track.');
        }
    });

    cancelEditButton.addEventListener('click', () => {
        editMusicModal.classList.add('hidden');
    });

    document.addEventListener("click", (e) => {
        const selectItems = document.querySelector(".select-items");
        if (selectItems && !selectItems.classList.contains('select-hide') && !selectContainer.contains(e.target)) {
            selectItems.classList.add("select-hide");
            document.querySelector(".select-selected").classList.remove("select-arrow-active");
        }
    });

    // --- Initialization ---
    authReady.then(authData => {
        console.log('Firebase is ready on Music page.');
        isAdmin = authData && authData.isAdmin;
        
        setupDropdown();
        populateSelect(addCategorySelect);
        populateSelect(editCategorySelect);
        
        const q = query(collection(db, "music"), orderBy("createdAt", "desc"));
        onSnapshot(q, (querySnapshot) => {
            allMusic = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderMusic();
        });
        
        if (isAdmin && adminMusicForm) {
            adminMusicForm.classList.remove('hidden');
        }
    }).catch(error => {
        console.error("Fatal Error: Firebase initialization failed on Music page.", error);
    });
});
