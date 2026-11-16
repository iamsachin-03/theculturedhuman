
import {
    db
} from "./firebase-config.js";
import {
    doc,
    getDoc,
    setDoc,
    increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const visitCounter = async () => {
    const counterDocRef = doc(db, "visits", "counter");

    try {
        const docSnap = await getDoc(counterDocRef);

        if (docSnap.exists()) {
            await setDoc(counterDocRef, {
                count: increment(1)
            }, {
                merge: true
            });
        } else {
            await setDoc(counterDocRef, {
                count: 1
            });
        }

        const updatedDocSnap = await getDoc(counterDocRef);
        const visitCount = updatedDocSnap.data().count;

        return visitCount;
    } catch (error) {
        console.error("Error updating visit counter: ", error);
        return null;
    }
};

export {
    visitCounter
};
