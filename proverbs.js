
// --- Proverbs Page Module: proverbs.js --- //

import { 
    db, 
    authReady, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp, 
    doc, 
    updateDoc, 
    deleteDoc 
} from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const proverbsList = document.getElementById('proverbs-list');
    const adminProverbForm = document.getElementById('admin-proverb-form');
    const newProverbForm = document.getElementById('new-proverb-form');
    const editProverbModal = document.getElementById('edit-proverb-modal');
    const editProverbForm = document.getElementById('edit-proverb-form');
    const cancelEditButton = document.getElementById('cancel-edit-button');

    let isAdmin = false;
    let allProverbs = [];

    const renderProverbs = () => {
        if (!proverbsList) return;
        proverbsList.innerHTML = '';
        if (allProverbs.length === 0) {
            proverbsList.innerHTML = `<p class="text-center text-gray-400">No proverbs have been added yet.</p>`;
            return;
        }
        allProverbs.forEach(proverb => {
            const proverbEl = document.createElement('div');
            proverbEl.className = 'proverb-card';
            proverbEl.innerHTML = `
                <div class="flex-grow">
                    <p class="proverb">${proverb.text || 'Proverb not available'}</p>
                    <p class="meaning">${proverb.meaning || 'Meaning not available'}</p>
                </div>
                ${isAdmin ? `
                <div class="proverb-actions">
                    <button data-id="${proverb.id}" class="edit-proverb-btn"><i class="fas fa-pencil-alt"></i></button>
                    <button data-id="${proverb.id}" class="delete-proverb-btn"><i class="fas fa-trash-alt"></i></button>
                </div>
                ` : ''}
            `;
            proverbsList.appendChild(proverbEl);
        });
    };

    authReady.then(authData => {
        isAdmin = authData && authData.isAdmin;
        console.log('Firebase is ready on Proverbs section. Admin status:', isAdmin);

        const proverbsCol = collection(db, 'proverbs');
        const q = query(proverbsCol, orderBy("createdAt", "desc"));

        onSnapshot(q, (snapshot) => {
            allProverbs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            renderProverbs();
        });

        if (newProverbForm) {
            newProverbForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const proverbText = document.getElementById('proverb-text').value;
                const proverbMeaning = document.getElementById('proverb-meaning').value;

                if (!proverbText || !proverbMeaning) {
                    alert('Please fill out both fields.');
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
                }
            });
        }

        if (isAdmin && adminProverbForm) {
            adminProverbForm.classList.remove('hidden');
        }

    }).catch(error => {
        console.error("Firebase initialization failed on Proverbs section.", error);
    });

    proverbsList.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const proverbId = target.dataset.id;

        if (target.classList.contains('edit-proverb-btn')) {
            const proverbToEdit = allProverbs.find(p => p.id === proverbId);
            if (proverbToEdit) {
                document.getElementById('edit-proverb-id').value = proverbId;
                document.getElementById('edit-proverb-text').value = proverbToEdit.text;
                document.getElementById('edit-proverb-meaning').value = proverbToEdit.meaning;
                editProverbModal.classList.remove('hidden');
            }
        }

        if (target.classList.contains('delete-proverb-btn')) {
            if (confirm('Are you sure you want to delete this proverb?')) {
                try {
                    await deleteDoc(doc(db, "proverbs", proverbId));
                } catch (error) {
                    console.error("Error deleting proverb: ", error);
                }
            }
        }
    });

    editProverbForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const proverbId = document.getElementById('edit-proverb-id').value;
        const newText = document.getElementById('edit-proverb-text').value;
        const newMeaning = document.getElementById('edit-proverb-meaning').value;

        if (!newText || !newMeaning) {
            alert('Please fill out both fields.');
            return;
        }

        try {
            const proverbRef = doc(db, "proverbs", proverbId);
            await updateDoc(proverbRef, {
                text: newText,
                meaning: newMeaning
            });
            editProverbModal.classList.add('hidden');
        } catch (error) {
            console.error("Error updating proverb: ", error);
        }
    });

    cancelEditButton.addEventListener('click', () => {
        editProverbModal.classList.add('hidden');
    });
});
