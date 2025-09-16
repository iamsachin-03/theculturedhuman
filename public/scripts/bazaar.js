import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js';
import { authReady } from './auth.js';

const db = getFirestore();

class BazaarSection extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        /* Add your component styles here */
        #admin-form {
          display: none;
          padding: 2rem;
          margin: 1rem 0;
          border: 1px solid #ccc;
          border-radius: 8px;
        }
        #product-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }
        .product-card {
          border: 1px solid #ccc;
          border-radius: 8px;
          padding: 1rem;
        }
        .product-card img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
        }
      </style>
      <section>
        <h2>Bazaar</h2>
        <div id="admin-form">
          <h3>Add New Product</h3>
          <form id="add-product-form">
            <input type="text" id="product-name" placeholder="Product Name" required>
            <input type="url" id="product-image" placeholder="Image URL" required>
            <textarea id="product-description" placeholder="Product Description" required></textarea>
            <button type="submit">Add Product</button>
          </form>
        </div>
        <div id="product-grid"></div>
      </section>
    `;

    this.addProductForm = this.shadowRoot.querySelector('#add-product-form');
    this.productGrid = this.shadowRoot.querySelector('#product-grid');

    this.addProductForm.addEventListener('submit', this.handleAddProduct.bind(this));

    authReady.then(({ user, claims }) => {
      if (claims && claims.admin) {
        this.shadowRoot.querySelector('#admin-form').style.display = 'block';
      }
      this.fetchProducts();
    });
  }

  fetchProducts() {
    const productsCollection = collection(db, 'bazaar');
    onSnapshot(productsCollection, (snapshot) => {
      this.productGrid.innerHTML = ''; // Clear existing products
      snapshot.forEach(doc => {
        const product = doc.data();
        const productCard = document.createElement('div');
        productCard.classList.add('product-card');
        productCard.innerHTML = `
          <img src="${product.imageUrl}" alt="${product.name}">
          <h3>${product.name}</h3>
          <p>${product.description}</p>
        `;
        this.productGrid.appendChild(productCard);
      });
    });
  }

  async handleAddProduct(event) {
    event.preventDefault();
    const productName = this.shadowRoot.querySelector('#product-name').value;
    const productImageUrl = this.shadowRoot.querySelector('#product-image').value;
    const productDescription = this.shadowRoot.querySelector('#product-description').value;

    try {
      await addDoc(collection(db, 'bazaar'), {
        name: productName,
        imageUrl: productImageUrl,
        description: productDescription,
        createdAt: serverTimestamp()
      });
      this.addProductForm.reset();
    } catch (error) {
      console.error("Error adding product: ", error);
    }
  }
}

customElements.define('bazaar-section', BazaarSection);
