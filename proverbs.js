
// --- Proverbs Page Module: proverbs.js --- //

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
    const proverbsList = document.getElementById('proverbs-list');
    const adminProverbForm = document.getElementById('admin-proverb-form');
    const newProverbForm = document.getElementById('new-proverb-form');

    // Wait for the authReady promise to resolve
    authReady.then(authData => {
        console.log('Firebase is ready on Proverbs section. Auth data:', authData);

        // Define the Firestore collection reference *after* auth is ready
        const proverbsCol = collection(db, 'proverbs');
        const q = query(proverbsCol, orderBy("createdAt", "desc"));

        // Function to render proverbs
        const getProverbs = () => {
            onSnapshot(q, (snapshot) => {
                if (!proverbsList) return;
                proverbsList.innerHTML = ''; 
                if (snapshot.empty) {
                    proverbsList.innerHTML = `<p class="text-center text-gray-400">No proverbs have been added yet.</p>`;
                    return;
                }
                snapshot.forEach(doc => {
                    const proverb = doc.data();
                    const proverbEl = document.createElement('div');
                    proverbEl.className = 'proverb-card'; 
                    proverbEl.innerHTML = `
                        <p class="proverb">${proverb.text || 'Proverb not available'}</p>
                        <p class="meaning">${proverb.meaning || 'Meaning not available'}</p>
                    `;
                    proverbsList.appendChild(proverbEl);
                });
            });
        };

        // Handle the new proverb form submission
        if (newProverbForm) {
            newProverbForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const proverbText = document.getElementById('proverb-text').value;
                const proverbMeaning = document.getElementById('proverb-meaning').value;

                if (!proverbText || !proverbMeaning) {
                    alert('Please fill out both the proverb and its meaning.');
                    return;
                }

                try {
                    // Use the serverTimestamp from the central auth.js module
                    await addDoc(proverbsCol, {
                        text: proverbText,
                        meaning: proverbMeaning,
                        createdAt: serverTimestamp()
                    });
                    newProverbForm.reset();
                } catch (error) {
                    console.error("Error adding proverb: ", error);
                    alert('There was an error adding the proverb. Please check the console.');
                }
            });
        }

        // Initial call to load proverbs
        getProverbs();

        // Show the admin form only if the user is an admin
        if (authData && authData.isAdmin) {
            if (adminProverbForm) {
                adminProverbForm.classList.remove('hidden');
            }
        }

    }).catch(error => {
        // Catch any errors during Firebase initialization
        console.error("Fatal Error: Firebase initialization failed on Proverbs section.", error);
        if(proverbsList) {
            proverbsList.innerHTML = `<p class="text-red-500">Fatal Error: Could not connect to the database.</p>`;
        }
    });
});
