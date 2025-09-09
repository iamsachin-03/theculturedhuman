
// --- Admin Login Module: admin.js --- //

import { auth, signInWithEmailAndPassword, sendPasswordResetEmail } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('admin-login-form');
    const loginFeedback = document.getElementById('login-feedback');
    const forgotPasswordLink = document.getElementById('forgot-password-link');

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const email = document.getElementById('admin-email').value;
            const password = document.getElementById('admin-password').value;

            signInWithEmailAndPassword(auth, email, password)
                .then(async (userCredential) => {
                    const user = userCredential.user;
                    const idTokenResult = await user.getIdTokenResult();

                    if (idTokenResult.claims.admin) {
                        window.location.href = '/';
                    } else {
                        if (loginFeedback) loginFeedback.textContent = 'You do not have admin privileges.';
                        auth.signOut();
                    }
                })
                .catch((error) => {
                    if (loginFeedback) {
                         loginFeedback.style.color = '#ef4444'; // Red for errors
                        switch (error.code) {
                            case 'auth/user-not-found':
                            case 'auth/wrong-password':
                            case 'auth/invalid-credential':
                                loginFeedback.textContent = 'Invalid email or password.';
                                break;
                            default:
                                loginFeedback.textContent = `Error: ${error.message}`;
                                break;
                        }
                    }
                });
        });
    }

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            const email = document.getElementById('admin-email').value;

            if (!email) {
                if(loginFeedback) {
                    loginFeedback.textContent = 'Please enter your email address first.';
                    loginFeedback.style.color = '#ef4444';
                }
                return;
            }

            sendPasswordResetEmail(auth, email)
                .then(() => {
                    if (loginFeedback) {
                        loginFeedback.textContent = 'A password reset link has been sent to your email.';
                        loginFeedback.style.color = 'var(--primary-color)'; // Use theme color for success
                    }
                })
                .catch((error) => {
                     if (loginFeedback) {
                        loginFeedback.textContent = `Error: ${error.message}`;
                        loginFeedback.style.color = '#ef4444';
                    }
                });
        });
    }
});
