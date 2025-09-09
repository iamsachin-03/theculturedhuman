
// --- Manch Page Module: manch.js --- //

import {
    db,
    authReady,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp
} from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const adminPostForm = document.getElementById('admin-post-form');
    const newPostForm = document.getElementById('new-post-form');
    const postsContainer = document.getElementById('posts-container');
    const selectContainer = document.querySelector(".custom-select-container");

    let allPosts = []; // Cache for all blog posts

    const renderPosts = (filter = 'all') => {
        if (!postsContainer) return;
        postsContainer.innerHTML = '';

        const filteredPosts = filter === 'all' 
            ? allPosts 
            : allPosts.filter(post => post.label === filter);

        if (filteredPosts.length === 0) {
            postsContainer.innerHTML = `<p class="text-center text-gray-400 col-span-full">No posts found in this category.</p>`;
            return;
        }

        filteredPosts.forEach(post => {
            const postEl = document.createElement('div');
            postEl.className = 'card rounded-2xl overflow-hidden group';
            postEl.innerHTML = `
                <div class="h-64 overflow-hidden">
                    <img src="${post.imageUrl || 'https://via.placeholder.com/400x250'}" alt="${post.title || 'Untitled Post'}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
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
        
        itemsContainer.innerHTML = ''; // Clear existing options
        
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
                renderPosts(this.dataset.value);
            });
        });

        document.addEventListener("click", () => {
            if (!itemsContainer.classList.contains('select-hide')) {
                itemsContainer.classList.add("select-hide");
                selected.classList.remove("select-arrow-active");
            }
        });
    }

    const fetchPostsAndSetup = async () => {
        try {
            const postsCol = collection(db, 'posts');
            const q = query(postsCol, orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            allPosts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const uniqueLabels = [...new Set(allPosts.map(post => post.label).filter(Boolean))];
            
            setupDropdown(uniqueLabels);
            renderPosts(); // Initial render of all posts

        } catch (error) {
            console.error("Error fetching posts: ", error);
            if (postsContainer) {
                postsContainer.innerHTML = `<p class="text-red-500 col-span-full">Error loading posts.</p>`;
            }
        }
    };

    authReady.then(authData => {
        console.log('Firebase is ready on Manch page.');

        fetchPostsAndSetup();

        if (newPostForm) {
            newPostForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const postsCol = collection(db, 'posts');
                    await addDoc(postsCol, {
                        title: document.getElementById('post-title').value,
                        imageUrl: document.getElementById('post-image-url').value,
                        content: document.getElementById('post-content').value,
                        author: document.getElementById('post-author').value,
                        label: document.getElementById('post-label').value,
                        createdAt: serverTimestamp()
                    });
                    newPostForm.reset();
                    fetchPostsAndSetup(); // Re-fetch and setup everything again
                } catch (error) {
                    console.error("Error adding post: ", error);
                    alert('There was an error adding the post.');
                }
            });
        }

        if (authData && authData.isAdmin) {
            if (adminPostForm) {
                adminPostForm.classList.remove('hidden');
            }
        }

    }).catch(error => {
        console.error("Fatal Error: Firebase initialization failed on Manch page.", error);
        if(postsContainer) {
            postsContainer.innerHTML = `<p class="text-red-500 col-span-full">Error: Could not connect to the database.</p>`;
        }
    });
});
