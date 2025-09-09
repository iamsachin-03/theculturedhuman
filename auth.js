
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    signOut 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- NEW ARCHITECTURE: A promise that resolves with the ID TOKEN RESULT --- //
const authReady = new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
        const loginLink = document.getElementById('login-link');
        const userInfo = document.getElementById('user-info');
        const userName = document.getElementById('user-name');
        
        if (user) {
            // User is signed in
            if(loginLink) loginLink.classList.add('hidden');
            if(userInfo) userInfo.classList.remove('hidden');
            if(userName) userName.textContent = user.displayName || user.email;
            
            // Get the fresh token with claims HERE and ONLY HERE.
            const idTokenResult = await user.getIdTokenResult(true);
            resolve(idTokenResult); // Resolve with the full token result

        } else {
            // User is signed out
            if(loginLink) loginLink.classList.remove('hidden');
            if(userInfo) userInfo.classList.add('hidden');
            resolve(null); // Resolve with null if no user
        }
    });
});

// Export the promise and the services
export { db, auth, authReady };

// --- Event Listeners & Auth Flow --- //

const handleEmailAuth = () => {
    const emailForm = document.getElementById('email-form');
    const authFeedback = document.getElementById('auth-feedback');

    if (emailForm) {
        emailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('email-input');
            const email = emailInput.value;

            const actionCodeSettings = {
                url: window.location.href.split('?')[0], // URL to redirect back to
                handleCodeInApp: true,
            };

            sendSignInLinkToEmail(auth, email, actionCodeSettings)
                .then(() => {
                    window.localStorage.setItem('emailForSignIn', email);
                    if (authFeedback) {
                        authFeedback.textContent = 'A sign-in link has been sent to your email!';
                        authFeedback.style.color = 'var(--primary-color)';
                    }
                    emailInput.value = '';
                })
                .catch((error) => {
                    console.error("Error sending sign-in link: ", error);
                     if (authFeedback) {
                        authFeedback.textContent = `Error: ${error.message}`;
                        authFeedback.style.color = '#ef4444'; // Red color for errors
                    }
                });
        });
    }

    if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
            // This can happen if the user opens the link on a different device.
            // Prompt the user for their email.
            email = window.prompt('Please provide your email for confirmation');
        }
        
        signInWithEmailLink(auth, email, window.location.href)
            .then((result) => {
                window.localStorage.removeItem('emailForSignIn');
                // You can access the new user via result.user
                // Additional user info profile can be updated here.
                window.location.href = '/'; // Redirect to home after successful login
            })
            .catch((error) => {
                console.error("Error signing in with email link: ", error);
                if (authFeedback) {
                    authFeedback.textContent = `Error: ${error.message}`;
                    authFeedback.style.color = '#ef4444';
                }
            });
    }
};

const handleSignOut = () => {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            signOut(auth).catch((error) => {
                console.error("Sign out failed: ", error.message);
            });
        });
    }
};


// Run the appropriate auth flow based on the current page
document.addEventListener('DOMContentLoaded', () => {
    handleEmailAuth();
    handleSignOut();
});
