
const admin = require('firebase-admin');

// **IMPORTANT:** Replace with the path to your service account key file
const serviceAccount = require('./serviceAccountKey.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://the-cultured-human-blog.firebaseio.com`
});

const db = admin.firestore();

const allPosts = [
    {
        id: 1,
        title: "The Philosophy of 'Litti Chokha': More Than Just a Dish",
        author: "Rohan Sharma",
        date: new Date("2024-07-20"),
        image: "https://images.unsplash.com/photo-1607584146087-24c65b53e7c8?q=80&w=1974&auto=format&fit=crop",
        tags: ["Culture", "Cuisine"],
        sponsored: true,
        content: `
            <p class="mb-4">Litti Chokha is not merely a dish; it's a cultural emblem. It represents the rustic soul of Bihar, a testament to simple ingredients creating extraordinary flavors. The sattu, or roasted gram flour, speaks of the land's agrarian roots, while the chokha—a mash of roasted eggplant, tomatoes, and potatoes—is a smoky, pungent counterpoint that grounds the dish.</p>
            <p class="mb-4">Historically, it was the perfect meal for travelers and farmers. It required minimal resources, could be cooked over an open fire, and provided sustained energy. This practicality is at the heart of Bihari ingenuity.</p>
            <h3 class="font-playfair text-2xl font-bold mt-6 mb-3">A Dish of Togetherness</h3>
            <p>Making litti is often a communal activity. Families gather, shaping the dough, stuffing it with spiced sattu, and roasting it over cow-dung cakes (uplas), which impart a unique, earthy aroma. It's a ritual of connection, a time for stories to be shared and bonds to be strengthened.</p>
        `
    },
    {
        id: 2,
        title: "Mastering the Surya Namaskar: A 12-Step Guide to Vitality",
        author: "Priya Singh",
        date: new Date("2024-07-18"),
        image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=2120&auto=format&fit=crop",
        tags: ["Fitness", "Wellness"],
        sponsored: false,
        content: `
            <p class="mb-4">The Surya Namaskar, or Sun Salutation, is a cornerstone of yogic practice. This sequence of 12 postures is a full-body workout that improves flexibility, strength, and cardiovascular health. But its benefits are more than just physical.</p>
            <h3 class="font-playfair text-2xl font-bold mt-6 mb-3">The 12 Steps</h3>
            <ol class="list-decimal list-inside space-y-2 mb-4">
                <li><b>Pranamasana (Prayer Pose):</b> Stand at the edge of your mat, feet together.</li>
                <li><b>Hasta Uttanasana (Raised Arms Pose):</b> Inhale and lift your arms up and back.</li>
                <li><b>Hasta Padasana (Hand to Foot Pose):</b> Exhale and bend forward from the waist.</li>
                <li><b>Ashwa Sanchalanasana (Equestrian Pose):</b> Inhale and push your right leg back.</li>
                <li><b>Dandasana (Stick Pose):</b> Hold your breath and bring your left leg back.</li>
                <li><b>Ashtanga Namaskara (Salute with Eight Parts):</b> Gently bring your knees down to the floor and exhale.</li>
                <li><b>Bhujangasana (Cobra Pose):</b> Inhale and slide forward, raising the chest up.</li>
                <li><b>Adho Mukha Svanasana (Downward-Facing Dog):</b> Exhale and lift the hips and tailbone up.</li>
                <li><b>Ashwa Sanchalanasana (Equestrian Pose):</b> Inhale and bring the right foot forward.</li>
                <li><b>Hasta Padasana (Hand to Foot Pose):</b> Exhale and bring the left foot forward.</li>
                <li><b>Hasta Uttanasana (Raised Arms Pose):</b> Inhale and roll the spine up.</li>
                <li><b>Tadasana (Mountain Pose):</b> Exhale and first straighten the body, then bring the arms down.</li>
            </ol>
            <p>Practicing this sequence daily can bring a profound sense of balance and energy to your life.</p>
        `
    },
    {
        id: 3,
        title: "The Ancient Wisdom of Chhath Puja",
        author: "Admin",
        date: new Date("2024-07-15"),
        image: "https://plus.unsplash.com/premium_photo-1678849033379-195b1b4637b5?q=80&w=2070&auto=format&fit=crop",
        tags: ["Culture", "Spirituality"],
        sponsored: false,
        content: `<p>A deep dive into the rituals and significance of Bihar's most important festival.</p>`
    },
    {
        id: 4,
        title: "Bihari Superfoods You Should Know",
        author: "Priya Singh",
        date: new Date("2024-07-12"),
        image: "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1974&auto=format&fit=crop",
        tags: ["Cuisine", "Wellness"],
        sponsored: false,
        content: `<p>From Makhana to Sattu, exploring the nutritional powerhouses of Bihari cuisine.</p>`
    },
     {
        id: 5,
        title: "The Art of Madhubani: A Painter's Legacy",
        author: "Rohan Sharma",
        date: new Date("2024-07-10"),
        image: "https://images.unsplash.com/photo-1588785118894-353293e5f756?q=80&w=2070&auto=format&fit=crop",
        tags: ["Culture", "Art"],
        sponsored: true,
        content: `<p>Exploring the intricate and meaningful world of Madhubani paintings.</p>`
    },
    {
        id: 6,
        title: "Functional Fitness: Training for Everyday Life",
        author: "Priya Singh",
        date: new Date("2024-07-08"),
        image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=2070&auto=format&fit=crop",
        tags: ["Fitness"],
        sponsored: false,
        content: `<p>How to build a fitness routine that supports your daily activities and prevents injury.</p>`
    },
    {
        id: 7,
        title: "Mindful Mornings: A 5-Step Ritual",
        author: "Admin",
        date: new Date("2024-07-05"),
        image: "https://images.unsplash.com/photo-1474418397713-7e15e4371bbf?q=80&w=2070&auto=format&fit=crop",
        tags: ["Wellness", "Spirituality"],
        sponsored: false,
        content: `<p>Start your day with intention and peace using this simple morning routine.</p>`
    },
    {
        id: 8,
        title: "Sponsored: The Best Yoga Mats for Your Practice",
        author: "Wellness Co.",
        date: new Date("2024-07-03"),
        image: "https://images.unsplash.com/photo-1599447462464-65c719da6393?q=80&w=1974&auto=format&fit=crop",
        tags: ["Fitness", "Gear"],
        sponsored: true,
        content: `<p>A sponsored review of the top yoga mats on the market for 2024.</p>`
    },
    {
        id: 9,
        title: "The Lost History of the Nalanda University",
        author: "Rohan Sharma",
        date: new Date("2024-07-01"),
        image: "https://images.unsplash.com/photo-1599599810694-b5a41785232b?q=80&w=1964&auto=format&fit=crop",
        tags: ["Culture", "History"],
        sponsored: false,
        content: `<p>Uncovering the stories of one of the world's oldest and greatest centers of learning.</p>`
    },
    {
        id: 10,
        title: "A Guide to Bihari Street Food",
        author: "Priya Singh",
        date: new Date("2024-06-28"),
        image: "https://images.unsplash.com/photo-1552526881-727ce8909899?q=80&w=2070&auto=format&fit=crop",
        tags: ["Cuisine"],
        sponsored: false,
        content: `<p>From the spicy 'chaat' to the sweet 'khaja', a journey through the flavors of Bihar's streets.</p>`
    },
    {
        id: 11,
        title: "Building a Home Gym on a Budget",
        author: "Admin",
        date: new Date("2024-06-25"),
        image: "https://images.unsplash.com/photo-1593079997458-94f715da4034?q=80&w=2070&auto=format&fit=crop",
        tags: ["Fitness", "Gear"],
        sponsored: false,
        content: `<p>Essential equipment and tips for creating an effective workout space at home without breaking the bank.</p>`
    },
    {
        id: 12,
        title: "The Poetic Soul of Bihar: A Look at Vidyapati",
        author: "Rohan Sharma",
        date: new Date("2024-06-22"),
        image: "https://images.unsplash.com/photo-1510915228340-29c85a43dcfe?q=80&w=2070&auto=format&fit=crop",
        tags: ["Culture", "History", "Art"],
        sponsored: false,
        content: `<p>Celebrating the timeless poetry of the Maithili poet Vidyapati and his influence on the region's culture.</p>`
    }
];

const seedDatabase = async () => {
  const postsCollection = db.collection('posts');
  console.log('Starting to seed database...');

  for (const post of allPosts) {
    try {
      await postsCollection.doc(post.id.toString()).set(post);
      console.log(`Added post: ${post.title}`);
    } catch (error) {
      console.error(`Error adding post ${post.title}:`, error);
    }
  }

  console.log('Database seeding completed!');
  process.exit(0);
};

seedDatabase();
