
import { db, authReady } from './auth.js';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';

const proverbsList = document.getElementById('proverbs-list');
const adminProverbForm = document.getElementById('admin-proverb-form');
const newProverbForm = document.getElementById('new-proverb-form');

// --- Wait for the final, verified ID token result --- //
authReady.then(idTokenResult => {
    // The check is now simple and direct.
    if (idTokenResult && idTokenResult.claims.admin) {
        adminProverbForm.classList.remove('hidden');
    }
    
    // Always get the proverbs, regardless of admin status
    getProverbs();
});


// --- Firestore Data Handling --- //

const proverbsCol = collection(db, 'proverbs');
const q = query(proverbsCol, orderBy("createdAt", "desc"));

const getProverbs = () => {
    onSnapshot(q, (snapshot) => {
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
                <p class="proverb">${proverb.text}</p>
                <p class="meaning">${proverb.meaning}</p>
            `;
            proverbsList.appendChild(proverbEl);
        });
    });
};

// --- Form Submission --- //

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
            await addDoc(proverbsCol, {
                text: proverbText,
                meaning: proverbMeaning,
                createdAt: serverTimestamp()
            });
            newProverbForm.reset();
        } catch (error) {
            console.error("Error adding proverb: ", error);
            alert('There was an error adding the proverb. Please try again.');
        }
    });
}
