
// --- Manch Page Module: manch.js --- //

// Import all Firebase functionality from our centralized auth.js module
import { 
    db, 
    authReady, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const adminPostForm = document.getElementById('admin-post-form');
    const newPostForm = document.getElementById('new-post-form');
    const postsContainer = document.getElementById('posts-container');

    // Wait for the authReady promise to resolve
    authReady.then(authData => {
        console.log('Firebase is ready on Manch page. Auth data:', authData);

        // Define the Firestore collection reference *after* auth is ready
        const postsCol = collection(db, 'posts');
        const q = query(postsCol, orderBy("createdAt", "desc"));

        // Function to render posts
        const getPosts = () => {
            onSnapshot(q, (snapshot) => {
                if (!postsContainer) return;
                postsContainer.innerHTML = '';
                if (snapshot.empty) {
                    postsContainer.innerHTML = `<p class="text-center text-gray-400 col-span-full">No posts have been added yet.</p>`;
                    return;
                }
                snapshot.forEach(doc => {
                    const post = doc.data();
                    const postEl = document.createElement('div');
                    postEl.className = 'card rounded-2xl overflow-hidden group';
                    // Note: Ensure all fields exist, provide defaults if necessary
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
                                <span>${post.createdAt ? post.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
                            </div>
                        </div>
                    `;
                    postsContainer.appendChild(postEl);
                });
            });
        };

        // Handle the new post form submission
        if (newPostForm) {
            newPostForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = document.getElementById('post-title').value;
                const imageUrl = document.getElementById('post-image-url').value;
                const content = document.getElementById('post-content').value;
                const author = document.getElementById('post-author').value;
                const label = document.getElementById('post-label').value;

                if (!title || !imageUrl || !content || !author || !label) {
                    alert('Please fill out all fields.');
                    return;
                }

                try {
                    // Use the serverTimestamp from the central auth.js module
                    await addDoc(postsCol, {
                        title, imageUrl, content, author, label,
                        createdAt: serverTimestamp()
                    });
                    newPostForm.reset();
                } catch (error) {
                    console.error("Error adding post: ", error);
                    alert('There was an error adding the post. Please check the console.');
                }
            });
        }

        // Initial call to load posts
        getPosts();

        // Show the admin form only if the user is an admin
        if (authData && authData.isAdmin) {
            if (adminPostForm) {
                adminPostForm.classList.remove('hidden');
            }
        }

    }).catch(error => {
        // Catch any errors during Firebase initialization
        console.error("Fatal Error: Firebase initialization failed on Manch page.", error);
        if(postsContainer) {
            postsContainer.innerHTML = `<p class="text-red-500 col-span-full">Fatal Error: Could not connect to the database.</p>`;
        }
    });
});
