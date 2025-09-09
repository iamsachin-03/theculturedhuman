
// --- Manch Page Module: manch.js --- //

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
    const adminPostForm = document.getElementById('admin-post-form');
    const newPostForm = document.getElementById('new-post-form');
    const postsContainer = document.getElementById('posts-container');
    const selectContainer = document.querySelector(".custom-select-container");

    // Edit Modal Elements
    const editPostModal = document.getElementById('edit-post-modal');
    const editPostForm = document.getElementById('edit-post-form');
    const cancelEditButton = document.getElementById('cancel-edit-post-button');

    // --- State ---
    let allPosts = []; // Cache for all blog posts
    let isAdmin = false;
    let currentFilter = 'all';

    // --- Functions ---

    const renderPosts = () => {
        if (!postsContainer) return;
        postsContainer.innerHTML = '';

        const filteredPosts = currentFilter === 'all' 
            ? allPosts 
            : allPosts.filter(post => post.label === currentFilter);

        if (filteredPosts.length === 0) {
            postsContainer.innerHTML = `<p class="text-center text-gray-400 col-span-full">No posts found in this category.</p>`;
            return;
        }

        filteredPosts.forEach(post => {
            const postEl = document.createElement('div');
            postEl.className = 'card rounded-2xl overflow-hidden group';
            postEl.innerHTML = `
                <div class="h-64 overflow-hidden relative">
                    <img src="${post.imageUrl || 'https://via.placeholder.com/400x250'}" alt="${post.title || 'Untitled Post'}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                     ${isAdmin ? `
                    <div class="card-actions absolute top-2 right-2">
                        <button data-id="${post.id}" class="edit-post-btn"><i class="fas fa-pencil-alt"></i></button>
                        <button data-id="${post.id}" class="delete-post-btn"><i class="fas fa-trash-alt"></i></button>
                    </div>
                    ` : ''}
                </div>
                <div class="p-8">
                    <span class="label">${post.label || 'General'}</span>
                    <h3 class="font-playfair text-3xl font-bold my-3">${post.title || 'Untitled Post'}</h3>
                    <p class="text-gray-400 mb-4">${(post.content || '').substring(0, 100)}...</p>
                    <div class="flex items-center text-sm text-gray-500">
                        <span>By ${post.author || 'Unknown'}</span>
                        <span class="mx-2">•</span>
                        <span>${post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
                    </div>
                </div>
            `;
            postsContainer.appendChild(postEl);
        });
    };

    function setupDropdown(labels) {
        if (!selectContainer) return;
        const selected = selectContainer.querySelector(".select-selected");
        const itemsContainer = selectContainer.querySelector(".select-items");
        
        itemsContainer.innerHTML = '';
        const allOption = document.createElement('div');
        allOption.dataset.value = 'all';
        allOption.textContent = 'All Labels';
        itemsContainer.appendChild(allOption);

        labels.forEach(label => {
            const option = document.createElement('div');
            option.dataset.value = label;
            option.textContent = label;
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
                itemsContainer.classList.add("select-hide");
                selected.classList.remove("select-arrow-active");
                currentFilter = this.dataset.value;
                renderPosts();
            });
        });
    }

    
    // --- Event Listeners ---

    if (newPostForm) {
        newPostForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await addDoc(collection(db, 'posts'), {
                    title: document.getElementById('post-title').value,
                    imageUrl: document.getElementById('post-image-url').value,
                    content: document.getElementById('post-content').value,
                    author: document.getElementById('post-author').value,
                    label: document.getElementById('post-label').value,
                    createdAt: serverTimestamp()
                });
                newPostForm.reset();
            } catch (error) {
                console.error("Error adding post: ", error);
                alert('Error adding post.');
            }
        });
    }

    postsContainer.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const postId = target.dataset.id;

        if (target.classList.contains('edit-post-btn')) {
            const postToEdit = allPosts.find(post => post.id === postId);
            if (postToEdit) {
                document.getElementById('edit-post-id').value = postId;
                document.getElementById('edit-post-title').value = postToEdit.title;
                document.getElementById('edit-post-image-url').value = postToEdit.imageUrl;
                document.getElementById('edit-post-content').value = postToEdit.content;
                document.getElementById('edit-post-author').value = postToEdit.author;
                document.getElementById('edit-post-label').value = postToEdit.label;
                editPostModal.classList.remove('hidden');
            }
        }

        if (target.classList.contains('delete-post-btn')) {
            if (confirm('Are you sure you want to delete this post?')) {
                deleteDoc(doc(db, "posts", postId)).catch(error => console.error("Error deleting post: ", error));
            }
        }
    });

    editPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const postId = document.getElementById('edit-post-id').value;
        const updatedData = {
            title: document.getElementById('edit-post-title').value,
            imageUrl: document.getElementById('edit-post-image-url').value,
            content: document.getElementById('edit-post-content').value,
            author: document.getElementById('edit-post-author').value,
            label: document.getElementById('edit-post-label').value,
        };

        try {
            await updateDoc(doc(db, "posts", postId), updatedData);
            editPostModal.classList.add('hidden');
        } catch (error) {
            console.error("Error updating post: ", error);
            alert('Error updating post.');
        }
    });

    cancelEditButton.addEventListener('click', () => {
        editPostModal.classList.add('hidden');
    });
    
    document.addEventListener("click", (e) => {
        const itemsContainer = selectContainer ? selectContainer.querySelector(".select-items") : null;
        if (itemsContainer && !itemsContainer.classList.contains('select-hide') && !selectContainer.contains(e.target)) {
            itemsContainer.classList.add("select-hide");
            selectContainer.querySelector(".select-selected").classList.remove("select-arrow-active");
        }
    });

    // --- Initialization ---
    authReady.then(authData => {
        console.log('Firebase is ready on Manch page.');
        isAdmin = authData && authData.isAdmin;
        
        const postsCol = collection(db, 'posts');
        const q = query(postsCol, orderBy("createdAt", "desc"));

        onSnapshot(q, (querySnapshot) => {
            allPosts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const uniqueLabels = [...new Set(allPosts.map(post => post.label).filter(Boolean))];
            setupDropdown(uniqueLabels);
            renderPosts(); 
        });

        if (isAdmin && adminPostForm) {
            adminPostForm.classList.remove('hidden');
        }

    }).catch(error => {
        console.error("Fatal Error: Firebase initialization failed on Manch page.", error);
    });
});
