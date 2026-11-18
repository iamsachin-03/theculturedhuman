
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const allProducts = [
    {
        id: "madhubani-peacock",
        name: "Madhubani Peacock Painting",
        artist: "Ritu Devi",
        price: 75.00,
        image: "https://images.unsplash.com/photo-1588785118894-353293e5f756?q=80&w=2070&auto=format&fit=crop",
        category: "Madhubani Art",
        description: "A vibrant, hand-painted Madhubani artwork depicting a peacock, a symbol of grace and beauty. Created with natural dyes on handmade paper."
    },
    {
        id: "sujini-wall-hanging",
        name: "Sujini Embroidered Wall Hanging",
        artist: "Sita Kumari",
        price: 120.00,
        image: "https://i.etsystatic.com/23723394/r/il/a1c3b1/3432371900/il_794xN.3432371900_e752.jpg",
        category: "Sujini Embroidery",
        description: "An intricate Sujini embroidery piece, showcasing traditional motifs from rural Bihar. This textile art tells a story through its stitches."
    },
    {
        id: "terracotta-elephant",
        name: "Terracotta Elephant Statue",
        artist: "Manoj Pandit",
        price: 45.00,
        image: "https://i.etsystatic.com/18822923/r/il/f1b538/2029304385/il_794xN.2029304385_325a.jpg",
        category: "Terracotta",
        description: "A handcrafted terracotta elephant, traditionally used in Bihari households as a symbol of good luck and prosperity. Fired and painted by hand."
    },
    {
        id: "bamboo-basket-set",
        name: "Handwoven Bamboo Basket Set",
        artist: "The Bamboo Weavers of Raghopur",
        price: 35.00,
        image: "https://i.etsystatic.com/32111161/r/il/d7546e/3362174244/il_794xN.3362174244_cyef.jpg",
        category: "Bamboo Craft",
        description: "A set of three versatile and eco-friendly baskets, handwoven from sustainable bamboo by skilled artisans in Raghopur."
    },
    {
        id: "litti-chokha-poster",
        name: "Litti Chokha Culinary Art Print",
        artist: "Patna Art Collective",
        price: 25.00,
        image: "https://images.unsplash.com/photo-1607584146087-24c65b53e7c8?q=80&w=1974&auto=format&fit=crop",
        category: "Modern Art",
        description: "A modern, stylized art print celebrating Bihar's most iconic dish, Litti Chokha. A perfect addition to any kitchen or dining space."
    },
    {
        id: "sikki-grass-coaster-set",
        name: "Sikki Grass Coaster Set",
        artist: "Ganga Devi",
        price: 18.00,
        image: "https://i.etsystatic.com/24032812/r/il/88e33f/3141147814/il_794xN.3141147814_s49a.jpg",
        category: "Sikki Grass Work",
        description: "A set of six beautiful coasters, hand-plaited from golden Sikki grass. This ancient craft is practiced primarily by women in the Mithila region."
    }
];

const seedDatabase = async () => {
  const productsCollection = db.collection('products');
  console.log('Starting to seed database with products...');

  for (const product of allProducts) {
    try {
      await productsCollection.doc(product.id).set(product);
      console.log(`Added product: ${product.name}`);
    } catch (error) {
      console.error(`Error adding product ${product.name}:`, error);
    }
  }

  console.log('Database seeding completed!');
  process.exit(0);
};

seedDatabase();
