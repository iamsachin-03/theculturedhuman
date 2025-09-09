
import { db, authReady } from './auth.js';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';

const adminPostForm = document.getElementById('admin-post-form');
const newPostForm = document.getElementById('new-post-form');
const postsContainer = document.getElementById('posts-container');

// --- DIAGNOSTIC STEP --- //
console.log("Manch.js script loaded. Waiting for authReady promise...");

authReady.then(idTokenResult => {
    console.log("--- MANCH.JS DIAGNOSTICS ---");
    console.log("authReady promise resolved. Received the following token result:");
    console.log(idTokenResult);

    if (idTokenResult) {
        console.log("Value of idTokenResult.claims.admin:", idTokenResult.claims.admin);
        if (idTokenResult.claims.admin === true) {
            console.log("Admin claim is TRUE. Attempting to show the form.");
            adminPostForm.classList.remove('hidden');
        } else {
            console.log("Admin claim is NOT true. Form will remain hidden.");
        }
    } else {
        console.log("idTokenResult is null. User is not logged in.");
    }
    console.log("--- END MANCH.JS DIAGNOSTICS ---");

    // Always get the posts, regardless of admin status
    getPosts();
});


// --- Firestore Data Handling --- //

const postsCol = collection(db, 'posts');
const q = query(postsCol, orderBy("createdAt", "desc"));

const getPosts = () => {
    onSnapshot(q, (snapshot) => {
        postsContainer.innerHTML = ''; 
        if (snapshot.empty) {
            postsContainer.innerHTML = `<p class="text-center text-gray-400 col-span-full">No posts have been added yet.</p>`;
            return;
        }
        snapshot.forEach(doc => {
            const post = doc.data();
            const postEl = document.createElement('div');
            postEl.className = 'card rounded-2xl overflow-hidden group';
            postEl.innerHTML = `
                <div class="h-64 overflow-hidden">
                    <img src="${post.imageUrl}" alt="${post.title}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                </div>
                <div class="p-8">
                    <span class="label">${post.label}</span>
                    <h3 class="font-playfair text-3xl font-bold my-3">${post.title}</h3>
                    <p class="text-gray-400 mb-4">${post.content.substring(0, 100)}...</p>
                    <div class="flex items-center text-sm text-gray-500">
                        <span>By ${post.author}</span>
                        <span class="mx-2">•</span>
                        <span>${post.createdAt ? post.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
                    </div>
                </div>
            `;
            postsContainer.appendChild(postEl);
        });
    });
};

// --- Form Submission --- //

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
            await addDoc(postsCol, {
                title: title,
                imageUrl: imageUrl,
                content: content,
                author: author,
                label: label,
                createdAt: serverTimestamp()
            });
            newPostForm.reset();
        } catch (error) {
            console.error("Error adding post: ", error);
            alert('There was an error adding the post. Please try again.');
        }
    });
}
