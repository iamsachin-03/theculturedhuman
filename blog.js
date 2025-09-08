
import { db } from './auth.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { 
    collection, 
    getDocs, 
    getDoc,
    doc,
    query, 
    orderBy, 
    limit, 
    startAfter, 
    endBefore, 
    getCountFromServer 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- DOM Elements ---
const blogGrid = document.getElementById('blog-grid');
const tagFilters = document.getElementById('tag-filters');
const paginationControls = document.getElementById('pagination-controls');
const postPreview = document.getElementById('post-preview');
const previewContent = document.getElementById('preview-content');
const closePreviewButton = document.getElementById('close-preview');
const adminControls = document.getElementById('admin-controls');

// --- State Management ---
let currentPage = 1;
let activeFilter = 'All';
const postsPerPage = 6;
let posts = [];
let lastVisible = null;
let firstVisible = null;
let totalPosts = 0;

// A simple UID check for admin privileges. Replace with a more secure method (e.g., custom claims) in a real app.
const ADMIN_UID = 'replace_with_your_actual_admin_uid';


// --- Admin Check ---
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
    if (user && user.uid === ADMIN_UID) {
        adminControls.classList.remove('hidden');
    }
});

// --- Data Fetching ---
const fetchPosts = async (direction = 'next') => {
    try {
        const postsRef = collection(db, "posts");
        let q;
        if (direction === 'next' && lastVisible) {
            q = query(postsRef, orderBy("date", "desc"), startAfter(lastVisible), limit(postsPerPage));
        } else if (direction === 'prev' && firstVisible) {
             q = query(postsRef, orderBy("date", "desc"), endBefore(firstVisible), limit(postsPerPage));
        } else {
            q = query(postsRef, orderBy("date", "desc"), limit(postsPerPage));
        }
        
        const documentSnapshots = await getDocs(q);
        
        lastVisible = documentSnapshots.docs[documentSnapshots.docs.length-1];
        firstVisible = documentSnapshots.docs[0];

        posts = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Get total posts count for pagination
        const countQuery = query(collection(db, "posts"));
        const snapshot = await getCountFromServer(countQuery);
        totalPosts = snapshot.data().count;

        renderAll();
    } catch (error) {
        console.error("Error fetching posts: ", error);
        blogGrid.innerHTML = `<p class="text-red-500 text-center md:col-span-2 lg:col-span-3">Error loading posts. Please try again later.</p>`;
    }
};


// --- Rendering Functions ---

const renderPosts = () => {
    blogGrid.innerHTML = '';
    const filteredPosts = posts.filter(post => activeFilter === 'All' || post.tags.includes(activeFilter));

    if (filteredPosts.length === 0) {
        blogGrid.innerHTML = `<p class="text-gray-400 text-center md:col-span-2 lg:col-span-3">No posts found.</p>`;
        return;
    }

    filteredPosts.forEach(post => {
        const postCard = document.createElement('div');
        postCard.className = 'blog-card';
        postCard.dataset.postId = post.id;
        postCard.innerHTML = `
            <div class="blog-card-image-container">
                <img src="${post.image}" alt="${post.title}" class="blog-card-image">
                ${post.sponsored ? '<span class="sponsored-badge">Sponsored</span>' : ''}
            </div>
            <div class="blog-card-content">
                <div class="blog-card-tags">
                    ${post.tags.map(tag => `<span>${tag}</span>`).join('')}
                </div>
                <h3 class="blog-card-title">${post.title}</h3>
                <p class="blog-card-author">By ${post.author} - ${new Date(post.date.seconds * 1000).toLocaleDateString()}</p>
            </div>
        `;
        blogGrid.appendChild(postCard);
    });
};

const renderTags = async () => {
    // Fetch all posts to get all tags - this is not ideal for performance with many posts
    // A better approach would be to have a separate 'tags' collection in Firestore
    const postsRef = collection(db, "posts");
    const allPostsSnapshot = await getDocs(postsRef);
    const allTags = ['All', ...new Set(allPostsSnapshot.docs.flatMap(p => p.data().tags))];
    
    tagFilters.innerHTML = '';
    allTags.forEach(tag => {
        const tagButton = document.createElement('button');
        tagButton.className = 'tag-filter';
        tagButton.textContent = tag;
        if (tag === activeFilter) {
            tagButton.classList.add('active');
        }
        tagButton.dataset.tag = tag;
        tagFilters.appendChild(tagButton);
    });
};

const renderPagination = () => {
    const totalPages = Math.ceil(totalPosts / postsPerPage);
    paginationControls.innerHTML = '';

    if (totalPages <= 1) return;

    // Previous Button
    const prevButton = document.createElement('button');
    prevButton.innerHTML = `<i class="fas fa-arrow-left"></i>`;
    prevButton.className = 'pagination-button';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        currentPage--;
        fetchPosts('prev');
    });
    paginationControls.appendChild(prevButton);

    // Page Numbers - Simple version for now
    const pageInfo = document.createElement('span');
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    pageInfo.className = 'px-4 py-2';
    paginationControls.appendChild(pageInfo);


    // Next Button
    const nextButton = document.createElement('button');
    nextButton.innerHTML = `<i class="fas fa-arrow-right"></i>`;
    nextButton.className = 'pagination-button';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        currentPage++;
        fetchPosts('next');
    });
    paginationControls.appendChild(nextButton);
}

// --- Event Handlers ---

tagFilters.addEventListener('click', (e) => {
    if (e.target.matches('.tag-filter')) {
        activeFilter = e.target.dataset.tag;
        currentPage = 1; 
        lastVisible = null; // Reset pagination
        fetchPosts();
    }
});

blogGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.blog-card');
    if (card) {
        openPreview(card.dataset.postId);
    }
});

const openPreview = async (postId) => {
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (postSnap.exists()) {
            const post = postSnap.data();
            previewContent.innerHTML = `
                <button id="close-preview" class="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors duration-300 w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                    <i class="fas fa-times text-2xl"></i>
                </button>
                <img src="${post.image}" alt="${post.title}" class="w-full h-64 md:h-80 object-cover rounded-t-lg mb-6">
                <div class="px-4">
                    <h1 class="font-playfair text-4xl md:text-5xl font-bold mb-4">${post.title}</h1>
                    <div class="flex items-center gap-4 text-gray-400 mb-6">
                        <span>By ${post.author}</span>
                        <span>${new Date(post.date.seconds * 1000).toLocaleDateString()}</span>
                         <div class="flex items-center gap-2">
                            <i class="far fa-heart"></i> 0
                        </div>
                        <div class="flex items-center gap-2">
                            <i class="far fa-comment"></i> 0
                        </div>
                    </div>
                    <div class="prose prose-invert max-w-none text-gray-300">
                        ${post.content}
                    </div>
                    <hr class="my-8 border-gray-700">
                    <h3 class="font-playfair text-2xl font-bold mb-4">Comments</h3>
                    <div id="comment-section">
                        <p class="text-gray-500">Comments are disabled for now.</p>
                    </div>
                </div>
            `;
            postPreview.classList.remove('hidden');
            postPreview.classList.add('flex');
            document.body.style.overflow = 'hidden';

            document.getElementById('close-preview').addEventListener('click', closePreview);
        } else {
            console.error("No such document!");
        }
    } catch (error) {
        console.error("Error getting document:", error);
    }
};

const closePreview = () => {
    postPreview.classList.add('hidden');
    postPreview.classList.remove('flex');
    document.body.style.overflow = 'auto';
};

closePreviewButton.addEventListener('click', closePreview);

postPreview.addEventListener('click', (e) => {
    if (e.target === postPreview) {
        closePreview();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && !postPreview.classList.contains('hidden')) {
        closePreview();
    }
});


// --- Initial Load ---
const renderAll = () => {
    renderPosts();
    renderTags();
    renderPagination();
}

fetchPosts();
