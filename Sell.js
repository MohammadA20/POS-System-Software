let shoppingCartItems = [];
const mysql = require("mysql2");
const { dialog } = require("electron");
const { ipcRenderer } = require("electron");
const { color } = require("chart.js/helpers");

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Test@1234",
  database: "supermarket",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Fetch product names from the database when the page loads
let productNames = [];
const fetchProductNamesQuery = "SELECT itemName FROM items";

pool.query(fetchProductNamesQuery, (err, results) => {
  if (err) {
    console.error("Error fetching product names:", err);
    return;
  }

  productNames = results.map((row) => row.itemName);
});

// Function to create and display the search suggestions
function createSearchSuggestions(input) {
  const suggestions = document.createElement("div");
  suggestions.classList.add("search-suggestions");

  const filteredProductNames = productNames.filter((name) =>
    name.toLowerCase().includes(input.toLowerCase())
  );

  if (filteredProductNames.length > 0) {
    filteredProductNames.forEach((name) => {
      const suggestion = document.createElement("div");
      suggestion.textContent = name;
      suggestion.classList.add("suggestion");
      suggestion.addEventListener("click", () => {
        document.getElementById("barcodeInput").value = name;
        addToCart("barcode");
        suggestions.remove();
      });
      suggestions.appendChild(suggestion);
    });
  } else {
    const noSuggestion = document.createElement("div");
    noSuggestion.textContent = "No results found";
    noSuggestion.classList.add("no-suggestion");
    suggestions.appendChild(noSuggestion);
  }

  return suggestions;
}

// Event listener for the barcodeInput field
const barcodeInput = document.getElementById("barcodeInput");
let suggestionsContainer = null;

barcodeInput.addEventListener("input", () => {
  const inputValue = barcodeInput.value.trim();

  if (suggestionsContainer) {
    suggestionsContainer.remove();
  }

  if (inputValue.length > 0) {
    suggestionsContainer = createSearchSuggestions(inputValue);
    barcodeInput.parentNode.appendChild(suggestionsContainer);
  }
});

function fetchProductInfoFromDatabase(productInput) {
  return new Promise((resolve, reject) => {
    const query = `
        SELECT iditem, itemName, pricePerItem, itemBarcode, SellPrice, ItemsQuantity
        FROM items
        WHERE itemBarcode = ? OR itemName = ?;
    `;

    pool.query(query, [productInput, productInput], (err, results) => {
      if (err) {
        reject({
          success: false,
          message: "Error fetching product information from the database",
        });
        return;
      }

      if (results.length > 0) {
        const productInfo = results[0];
        resolve({
          success: true,
          productInfo: {
            iditem: productInfo.iditem, // Include iditem in the response
            itemName: productInfo.itemName,
            pricePerItem: productInfo.SellPrice,
          },
        });
      } else {
        reject({ success: false, message: "Product not found" });
      }
    });
  });
}

let selectedItemIndex = null;
function addToCart(productInput, fromQuickMenu = false) {
  let barcodeValue = "";

  if (productInput === "barcode") {
    const barcodeInput = document.getElementById("barcodeInput");
    if (!barcodeInput) {
      console.error("Barcode input field not found");
      return;
    }
    barcodeValue = barcodeInput.value.trim();
  }

  fetchProductInfoFromDatabase(
    productInput === "barcode" ? barcodeValue : productInput
  )
    .then((result) => {
      if (result.success) {
        const iditem = result.productInfo.iditem;
        const quantity = 1;
        const pricePerItem = result.productInfo.pricePerItem;
        const itemName = result.productInfo.itemName;

        const existingItemIndex = shoppingCartItems.findIndex(
          (item) => item.productInput === itemName
        );

        if (existingItemIndex !== -1) {
          shoppingCartItems[existingItemIndex].quantity += quantity;
          selectedItemIndex = existingItemIndex;
        } else {
          const newItem = {
            iditem: iditem,
            productInput: itemName || productInput,
            quantity,
            pricePerItem,
          };

          shoppingCartItems.push(newItem);
          selectedItemIndex = shoppingCartItems.length - 1;
        }

        updateShoppingCartUI();

        // Clear the barcode input field after adding the item to the cart
        if (productInput === "barcode") {
          const barcodeInput = document.getElementById("barcodeInput");
          if (barcodeInput) {
            barcodeInput.value = "";
          }
        }
      } else {
        console.error(result.message);
      }
    })
    .catch((error) => {
      console.error("Error fetching product information:", error);
    });
}

function fetchProductInfo(inputType) {
  const inputField = document.getElementById(`${inputType}Input`);
  const productInput = inputField.value.trim();

  if (productInput !== "") {
    fetchProductInfoFromDatabase(productInput)
      .then((result) => {
        if (result.success) {
          console.log("Product information:", result.productInfo);
          const pricePerItem = result.productInfo.pricePerItem;
          console.log("Price per item:", pricePerItem);

          // If input type is 'name', update the price field
          if (inputType === "name") {
            document.getElementById("price").value = pricePerItem || "";
          }
        } else {
     //  console.error(result.message);
        }
      })
      .catch((error) => {
          console.error("Error fetching product information:", error);
      });
  }
}

function updateShoppingCartUI() {
  const shoppingCartBody = document.querySelector("#shoppingCart tbody");
  shoppingCartBody.innerHTML = "";

  shoppingCartItems.forEach((item, index) => {
    const row = shoppingCartBody.insertRow();
    const itemNameCell = row.insertCell(0);
    const quantityCell = row.insertCell(1);
    const priceCell = row.insertCell(2);
    const totalCell = row.insertCell(3);
    const actionCell = row.insertCell(4);

    const itemNameInput = document.createElement("input");
    itemNameInput.type = "text";
    itemNameInput.value = item.productInput;
    itemNameInput.addEventListener("input", (event) =>
      updateItemDetails(index, "itemName", event.target.value)
    );

    itemNameInput.disabled = true;

    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.value = item.quantity;
    let quantityTimeout;
    quantityInput.addEventListener("input", (event) => {
      clearTimeout(quantityTimeout);
      quantityTimeout = setTimeout(() => {
        const value = parseInt(event.target.value, 10);
        updateItemDetails(index, "quantity", isNaN(value) ? 0 : value);
      }, 1000);
    });

    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.value = item.pricePerItem;
    let priceTimeout;
    priceInput.addEventListener("input", (event) => {
      clearTimeout(priceTimeout);
      priceTimeout = setTimeout(() => {
        updateItemDetails(index, "pricePerItem", event.target.value);
      }, 1000);
    });

    itemNameCell.appendChild(itemNameInput);
    quantityCell.appendChild(quantityInput);
    priceCell.appendChild(priceInput);

    const totalPrice = item.quantity * item.pricePerItem;
    totalCell.textContent = totalPrice.toFixed(2);

    const removeButton = document.createElement("button");
    removeButton.textContent = "❌";
    removeButton.onclick = () => removeFromCart(index);
    actionCell.appendChild(removeButton);
  });

  updateTotalAmount();
}

function updateItemDetails(index, property, value) {
  shoppingCartItems[index][property] = value;
  updateShoppingCartUI();
}

function removeFromCart(index) {
  shoppingCartItems.splice(index, 1);

  updateShoppingCartUI();
}

function updateTotalAmount() {
  const totalAmount = shoppingCartItems.reduce(
    (total, item) => total + item.quantity * item.pricePerItem,
    0
  );
  document.getElementById("totalAmount").textContent = totalAmount.toFixed(2);
}

function checkout() {
  const creditCardInput = document.getElementById("creditCardInput").value.trim();
  const isCashSelected = document.getElementById("cash").checked;
  const isCardSelected = document.getElementById("card").checked;

  if (isCardSelected) {
      if (creditCardInput.length !== 12 || isNaN(parseInt(creditCardInput))) {
         document.getElementById("CardAlert").innerHTML = "<P style ='color:red'> Please enter a valid 12-digit credit card number.</p>";
          return;
      }
  }

  console.log("Checkout triggered!");

  const insertInvoiceQuery =
      "INSERT INTO invoices (itemName, quantity, pricePerItem, totalPrice, iditem) VALUES ?";
  const updateQuantityQuery =
      "UPDATE items SET itemsQuantity = itemsQuantity - 0 WHERE iditem = ?";

  const invoiceData = shoppingCartItems.map((item) => [
      item.productInput,
      item.quantity,
      item.pricePerItem,
      item.quantity * item.pricePerItem,
      item.iditem,
  ]);

  shoppingCartItems.map((item) => console.log(item));

  pool.getConnection((err, connection) => {
      if (err) {
          console.error("Error getting database connection:", err);
          return;
      }

      connection.beginTransaction((transactionErr) => {
          if (transactionErr) {
              connection.release();
              console.error("Error starting database transaction:", transactionErr);
              return;
          }

          // Insert invoice details
          connection.query(
              insertInvoiceQuery,
              [invoiceData],
              (insertErr, result) => {
                  if (insertErr) {
                      console.error("Error inserting invoice details:", insertErr);
                      connection.rollback(() => {
                          connection.release();
                      });
                      return;
                  }

                  shoppingCartItems.forEach((item) => {
                      connection.query(
                          updateQuantityQuery,
                          [item.quantity, item.iditem],
                          (updateErr, updateResult) => {
                              if (updateErr) {
                                  console.error("Error updating quantity:", updateErr);
                              }
                          }
                      );
                  });

                  connection.commit((commitErr) => {
                      if (commitErr) {
                          connection.rollback(() => {
                              connection.release();
                              console.error("Error committing transaction:", commitErr);
                          });
                      } else {
                          console.log("Transaction committed successfully.");

                          shoppingCartItems = [];
                          updateShoppingCartUI();

                          connection.release();
                      }
                  });
              }
          );
      });
  });
}



function goBack() {
  console.log("Navigating back to Home.html");
  window.location.href = "Home.html";
}
function goToDept() {
  console.log("Navigating back to Home.html");
  window.location.href = "Edept.html";
}

function showAlert(message, callback) {
  ipcRenderer.send("show-alert", message);

  ipcRenderer.on("alert-closed", () => {
    // Execute callback function
    callback();
  });
}

function holdCart() {
  localStorage.setItem("heldCartItems", JSON.stringify(shoppingCartItems));

  shoppingCartItems = [];
  updateShoppingCartUI();

  console.log("Shopping cart items held.");
}

function executeVoucherAndRestore() {
  console.log("Voucher executed.");

  const heldCartItems = JSON.parse(localStorage.getItem("heldCartItems"));

  if (heldCartItems && heldCartItems.length > 0) {
    shoppingCartItems = heldCartItems;
    updateShoppingCartUI();

    localStorage.removeItem("heldCartItems");

    console.log("Held cart items restored.");
  } else {
    console.log("No held cart items found.");
  }
}

executeVoucherAndRestore();
function restoreHeldCart() {
  const heldCartItemsJSON = localStorage.getItem("heldCartItems");

  if (heldCartItemsJSON) {
    const heldCartItems = JSON.parse(heldCartItemsJSON);

    shoppingCartItems = heldCartItems;

    updateShoppingCartUI();

    localStorage.removeItem("heldCartItems");

    console.log("Held cart items restored.");
  } else {
    console.log("No held cart items found.");
  }
}

function changeQuantity(quantity) {
  if (
    selectedItemIndex !== null &&
    selectedItemIndex >= 0 &&
    selectedItemIndex < shoppingCartItems.length
  ) {
    shoppingCartItems[selectedItemIndex].quantity = quantity;

    updateShoppingCartUI();
  } else {
    console.error("No item selected or invalid index.");
  }
}
function autoCheckout() {
  if (shoppingCartItems.length > 0) {
    checkout();
  } else {
    console.log("Shopping cart is empty. No items to checkout.");
  }
}

document.addEventListener("DOMContentLoaded", () => {

  fetchQuickMenuItems();


  const quickMenuItemsContainer = document.getElementById("quickMenuItems");
  quickMenuItemsContainer.addEventListener("click", (event) => {

    if (event.target.tagName === "BUTTON") {
 
      const itemName = event.target.dataset.name;

 
      const barcodeInput = document.getElementById("barcodeInput");
      if (barcodeInput) {
        barcodeInput.value = itemName;

      
        barcodeInput.value = "";

      
        addToCart(itemName, true); 
      }
    }
  });
});

function fetchQuickMenuItems() {
  const quickMenuItemsContainer = document.getElementById("quickMenuItems");
  quickMenuItemsContainer.innerHTML = ""; 


  const query =
    "SELECT itemname, MAX(sellprice) AS sellprice FROM items WHERE type = 'quick_menu' GROUP BY itemname";

  pool
    .promise()
    .query(query)
    .then(([rows, fields]) => {
      rows.forEach((item) => {
        const button = document.createElement("button");
        button.textContent = `${item.itemname}`; 
        button.dataset.name = item.itemname; 
        button.dataset.price = item.sellprice; 
        quickMenuItemsContainer.appendChild(button);
      });
    })
    .catch((error) => {
      console.error("Error fetching quick menu items:", error);
    });
}

function addItem() {
  const itemName = document.getElementById("itemName").value.trim();
  const itemPrice = parseFloat(document.getElementById("itemPrice").value);
  

  if (!itemName || isNaN(itemPrice) || itemPrice <= 0) {
    alert("Please enter valid item name and price.");
    return;
  }

  // Insert the new item into the database
  const query = `
  INSERT INTO items (itemname, sellprice, type) 
  VALUES (?, ?, ?)
  ON DUPLICATE KEY UPDATE 
      sellprice = VALUES(sellprice)
  `;
  pool
    .promise()
    .execute(query, [itemName, itemPrice, "quick_menu"])
    .then((result) => {
      console.log("Item added to quick menu:", itemName, itemPrice);
      if (result && result.warningStatus === 0) {
        // Success
      } else {
        // Handle error
      }
      // Refresh the displayed quick menu items
      fetchQuickMenuItems();
    })
    .catch((error) => {
      console.error("Error adding/updating item in quick menu:", error);
      alert("An error occurred while adding/updating the item.");
    });
    // Set values to empty strings
document.getElementById("itemName").value = "";
document.getElementById("itemPrice").value = "";
}
