const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const mysql = require("mysql2");
const util = require("util");
const path = require("path");

const { dialog } = require("electron");
const fs = require("fs");


//firebase start
const { initializeApp } = require("firebase/app");
const {
  getDatabase,
  ref,//node name that contain data (items in firebase)
  set,
  get,
  update,
  child,
  onValue,//listener lma yn3ml add new varcode to the firebase
} = require("firebase/database");

const firebaseConfig = {
  apiKey: "AIzaSyDWM5qLQdgrCM4AecKgmvCngEfWZrkIBLw",
  authDomain: "tss-pos-34bfc.firebaseapp.com",//domain unique for our database for security
  databaseURL:
    "https://tss-pos-34bfc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tss-pos-34bfc",
  storageBucket: "tss-pos-34bfc.appspot.com",//our storage in database free 
  messagingSenderId: "540486358553",//current platform (pos) project number from settings / general
  appId: "1:540486358553:web:690903dc6cd8deea37bc88",
  measurementId: "G-EJX6Z2V8NV",
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);



//read last barcode from firebase and sned it to sell.html for cashier
const userRef = ref(database, "Scanner");

const readDataAndLog = (snapshot) => {
  const lastNode = snapshot.val();
  const lastNodeKey = Object.keys(lastNode).pop();
  const lastNodeValue = lastNode[lastNodeKey];

  console.log("Last node key:", lastNodeKey);
  console.log("Last node value:", lastNodeValue);

  // Send the last node value to the renderer process
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("last-node-value", lastNodeValue);
  });
};

onValue(userRef, readDataAndLog);


async function fetchItemsFromDatabase() {// mnjeb data lal items krmal nb3ton bl firebase reaaltime
  try {
    const queryResult = await query("SELECT iditem, itemName, itemsQuantity,SellPrice, itemBarcode,categorie, expire_date FROM items");
    return queryResult;
  } catch (error) {
    console.error("Error fetching items from database:", error);
    throw error;
  }
}

async function syncItemsWithFirebase() {//send data from pos to firebase
  try {
    const items = await fetchItemsFromDatabase();//5dle items of database(MYSQL) w ktebon b node(refrence) tab3et firebase
    const itemsRef = ref(database, "items");//hyda esm el node

    const snapshot = await get(itemsRef);//jble node
    const existingItems = snapshot.val() || {}; //extract content of snapshot

    // Array to store Firebase keys of items to delete
    const keysToDelete = [];

    // Loop through existing items in Firebase
    for (const firebaseItemId in existingItems) {
      // Check if the item exists in the local database
      const localItemExists = items.some(
        (item) => item.iditem === parseInt(firebaseItemId)
      );

      // If the item does not exist locally, mark it for deletion
      if (!localItemExists) {
        keysToDelete.push(firebaseItemId);
      }
    }

    // Delete items from Firebase that do not exist locally
    for (const key of keysToDelete) {
      const itemRefToDelete = child(itemsRef, key);
      await set(itemRefToDelete, null); // Set to null to delete
      console.log(`Item with ID ${key} deleted from Firebase.`);
    }

    //  categorie, expire_date
    for (const item of items) {
      const itemRef = child(itemsRef, item.iditem.toString());
      const itemData = {
        iditem: item.iditem,
        itemBarcode: item.itemBarcode,
        itemName: item.itemName,
        SellPrice: item.SellPrice,
        category: item.categorie,
        expire_date: item.expire_date,
      };


      // Check if the item already exists in Firebase
      if (existingItems[item.iditem]) {
        await update(itemRef, itemData);
      } else {
        await set(itemRef, itemData);
      }
    }

    console.log("Items synced with Firebase successfully.");
  } catch (error) {
    console.error("Error syncing items with Firebase:", error);
  }
}

setInterval(syncItemsWithFirebase, 30000);//call function after 30 seconds

//firebase end



// mysql connection
const pool = mysql.createPool({
  connectionLimit: 10,
  host: "localhost",
  user: "root",
  password: "Test@1234",
  database: "supermarket",
  port: 3306,
});

const query = util.promisify(pool.query).bind(pool);//full prmission to execute the quary 

let mainWindow;

app.on("ready", () => {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, "logo.png"), //dirname (wnn main.js+pic for application logo)
    webPreferences: { //each page setting (renderer pages)
      nodeIntegration: true, //allow comunication btw main.js and other pages
      contextIsolation: false, //no isolation for  data to the main.js
      preload: path.join(__dirname, "preload.js"), //bridge to tranfer data btw renderer page and main 
      //and to let use functionality of main.js(electron)
    },
     autoHideMenuBar: true,
  });

  mainWindow.maximize(); //already maximized page by default

  const indexPath = path.join(__dirname, "index.html"); //path to the first page will open
  mainWindow.loadFile(indexPath); // load the first page

  mainWindow.on("closed", () => {
    mainWindow = null; // set current window to null (no window so close the window)
  });

  ipcMain.on("submitDeptForm", (event, deptData) => {//recieve data from dept.html
    const { name, living, phone, amount, paid, remain, item, unit, date } = deptData; //deptdata is revicrd from dept.html then we assign values for each const
    const sql = `INSERT INTO depts (name, living, phone_number, amount, paid, remain, name_of_item, unit, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [
      name,
      living,
      phone,
      amount,
      paid,
      remain,
      item,
      unit,
      date,
    ];

    pool.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error inserting data:", err); //if error occur dont crash the app //error handeling
        event.reply("submission-error", "Error submitting form data");
        return;
      }
      console.log("Data inserted successfully");
      event.reply("submission-success", "Form data submitted successfully");
    });
  });



  mainWindow.webContents.on("did-finish-load", () => {
    const query = "SELECT * FROM items";

    pool.query(query, (err, results) => {
      if (err) {
        console.error("Error executing SQL query:", err);
        return;
      }

      mainWindow.webContents.send("inventory-data", results);
    });
  });

  ipcMain.on("submitEmployeeForm", async (event, formData) => {
    try {
      const { username, password, type } = formData;
      const insertQuery =
        "INSERT INTO accounts (username, password, type) VALUES (?, ?, ?)";
      await query(insertQuery, [username, password, type]);

      event.reply(
        "employeeFormSubmissionSuccess",
        "Employee data inserted successfully"
      );
    } catch (error) {
      console.error("Error inserting employee data:", error);
      event.reply(
        "employeeFormSubmissionError",
        "Error inserting employee data"
      );
    }
  });


  ipcMain.on("fetch-quick-menu-items", async (event) => {
    try {
      const query = util.promisify(pool.query).bind(pool);
      const queryString = 'SELECT * FROM items where type="quick_menu"';
      const results = await query(queryString);
      event.sender.send("quick-menu-items-fetched", results);
    } catch (error) {
      console.error("Error fetching quick menu items:", error);
    }
  });

  ipcMain.on("remove-quick-menu-item", async (event, itemName) => {
    try {
      const deleteQuery = "DELETE FROM items WHERE itemname = ?";
      await query(deleteQuery, [itemName]);

      const updatedMenuItems = await query(
        'SELECT * FROM items where type ="quick_menu"'
      );
      event.sender.send("quick-menu-items-fetched", updatedMenuItems);
    } catch (error) {
      console.error("Error removing quick menu item:", error);
    }
  });
});

app.on("before-quit", () => {
  pool.end();
});

ipcMain.on("fetch-sales-data", async (event) => {
  try {
    const query = `
      SELECT 
          InvoiceNumber,
          GROUP_CONCAT(itemName ORDER BY invoiceId SEPARATOR ',') AS itemNames,
          SUM(quantity) AS totalQuantity,
          SUM(totalPrice) AS totalSales,
          SUM(profitPrice) AS profitPrice,
          MIN(timestamp) AS earliestTimestamp,
          MAX(timestamp) AS latestTimestamp
      FROM 
          invoices
      GROUP BY 
          InvoiceNumber
    `;

    pool.query(query, (error, rows) => {
      if (error) {
        console.error("Error executing SQL query:", error);
        event.reply("sales-data-error", "Error fetching sales data");
        return;
      }

      event.reply("sales-data", rows);
    });
  } catch (error) {
    console.error("Error fetching sales data:", error);
    event.reply("sales-data-error", "Error fetching sales data");
  }
});

ipcMain.on("remove-item", async (event, itemId) => {
  try {
    const deleteQuery = `DELETE FROM items WHERE iditem = ?`;
    await query(deleteQuery, [itemId]);

    const selectQuery = "SELECT * FROM items";
    const results = await query(selectQuery);

    mainWindow.webContents.send("inventory-data", results);
  } catch (error) {
    console.error("Error executing SQL query:", error);
  }
});

ipcMain.handle("insert-item", async (event, itemData) => {
  try {
    const { iditem, ...restOfData } = itemData;

    // Check if the item already exists
    const selectQuery = "SELECT * FROM items WHERE iditem = ?";
    const [existingItem] = await query(selectQuery, [iditem]);

    if (existingItem) {
      // Update the existing item
      const updateQuery = "UPDATE items SET ? WHERE iditem = ?";
      await query(updateQuery, [restOfData, iditem]);

      event.sender.send("item-inserted", {
        success: true,
        message: "Item updated successfully",
      });
      return { success: true, message: "Item updated successfully" };
    } else {
      // Insert a new item
      const insertQuery = "INSERT INTO items SET ?";
      await query(insertQuery, itemData);

      event.sender.send("item-inserted", {
        success: true,
        message: "Item inserted successfully",
      });
      return { success: true, message: "Item inserted successfully" };
    }
  } catch (error) {
    console.error("Error inserting/updating item:", error);
    return { success: false, error: "Error inserting/updating item" };
  }
});

ipcMain.on("fetch-items", async (event) => {
  try {
    const selectQuery = "SELECT * FROM items WHERE type = 'regular'";
    const items = await query(selectQuery);

    event.sender.send("items-fetched", items);
  } catch (error) {
    console.error("Error fetching items:", error);
    event.sender.send("items-fetched", []);
  }
});


ipcMain.handle("login-attempt", async (event, credentials) => {
  //console.log("Received login attempt:", credentials);
  const { email, password } = credentials;

  try {
    const user = await query(
      "SELECT username, type FROM accounts WHERE username = ? AND password = ?",
      [email, password]
    );

    if (user.length > 0) {
      console.log("Received login attempt:", user[0]);
      return { success: true, user: user[0] };
    } else {
      return { success: false, error: "Invalid credentials" };
    }
  } catch (error) {
    console.error("Error during login attempt:", error);
    return { success: false, error: "Internal server error" };
  }
});
ipcMain.on("fetchDeptData", async (event) => {
  try {
    const sql = "SELECT * FROM depts where remain > 0";
    const depts = await query(sql);
    event.sender.send("deptData", depts);
  } catch (error) {
    console.error("Error fetching department data:", error);
    event.sender.send("deptDataError", error.message);
  }
});

ipcMain.on("updateDeptData", async (event, updatedData) => {
  try {
    const { id, name, living, phone, amount, paid, remain, item, unit } =
      updatedData;
    const updateQuery =
      "UPDATE depts SET name = ?, living = ?, phone_number = ?, amount = ?, paid = ?, remain = ?, name_of_item = ?, unit = ? WHERE id = ?";
    const values = [name, living, phone, amount, paid, remain, item, unit, id];
    await query(updateQuery, values);
    event.sender.send("deptDataUpdated", updatedData);
  } catch (error) {
    console.error("Error updating department data:", error);
    event.sender.send("deptDataUpdateError", error.message);
  }
});


//mnb3at all names of borowwers to dept select options (combobox)
ipcMain.on("fetchNames", (event) => {
  fetchNamesFromDatabase((error, names) => {
    if (error) {
      event.sender.send("namesFetched", []);
      return;
    }
    event.sender.send("namesFetched", names);
  });
});


ipcMain.on("deleteDeptRow", async (event, id) => {
  try {
    const deleteQuery = "DELETE FROM depts WHERE id = ?";
    await query(deleteQuery, [id]);

    event.sender.send("deptRowDeleted", id);

    mainWindow.reload();
  } catch (error) {
    console.error("Error deleting department row:", error);
  }
});

ipcMain.on("editPaidAmount", async (event, { id, newPaidAmount }) => {
  try {
    const updateQuery = "UPDATE depts SET paid = ? WHERE id = ?";
    await query(updateQuery, [newPaidAmount, id]);

    event.sender.send("paidAmountEdited", { id, newPaidAmount });

    const updatedDepts = await query("SELECT * FROM depts");

    mainWindow.webContents.send("deptData", updatedDepts);
  } catch (error) {
    console.error("Error updating paid amount:", error);
  }
});

ipcMain.on("fetch-categories", async (event) => {
  try {
    const sql = "SELECT DISTINCT * FROM categories";
    const categories = await query(sql);
    event.sender.send("categories-fetched", categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    event.sender.send("categories-fetch-error", error.message);
  }
});

ipcMain.on("fetch-suppliers", async (event) => {
  try {
    const sql = "SELECT DISTINCT * FROM suppliers";
    const suppliers = await query(sql);
    event.sender.send("suppliers-fetched", suppliers);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    event.sender.send("suppliers-fetch-error", error.message);
  }
});

ipcMain.on("insert-supplier", async (event, data) => {
  try {
    const { supp, suppnum, supploc } = data;
    const insertQuery =
      "INSERT INTO suppliers (supplier, supplier_Location, Phone_Number) VALUES (?, ?, ?)";
    await query(insertQuery, [supp, supploc, suppnum]);

    console.log("Supplier inserted successfully:", supp);
    event.reply("supplier-inserted", {
      success: true,
      message: "Supplier inserted successfully",
    });

    // Fetch the updated suppliers list and send it back to the renderer process
    const updatedSuppliers = await query("SELECT DISTINCT * FROM suppliers");
    event.sender.send("suppliers-fetched", updatedSuppliers);
  } catch (error) {
    console.error("Error inserting supplier:", error);
    event.reply("supplier-inserted", {
      success: false,
      error: "Error inserting supplier",
    });
  }
});

ipcMain.on("insert-category", async (event, data) => {
  try {
    const { catego } = data;
    const insertQuery = "INSERT INTO categories (categorie_name) VALUES (?)";
    await query(insertQuery, [catego]);

    console.log("Category inserted successfully:", catego);
    event.reply("category-inserted", {
      success: true,
      message: "Category inserted successfully",
    });

    // Fetch the updated categories list and send it back to the renderer process
    const updatedCategories = await query("SELECT DISTINCT * FROM categories");
    event.sender.send("categories-fetched", updatedCategories);
  } catch (error) {
    console.error("Error inserting category:", error);
    event.reply("category-inserted", {
      success: false,
      error: "Error inserting category",
    });
  }
});


ipcMain.on("fetchDeptById", async (event, deptId) => {
  try {
    const sql = "SELECT * FROM depts WHERE id = ?";
    const depts = await query(sql, [deptId]);
    event.sender.send("deptById", depts);
  } catch (error) {
    console.error("Error fetching department data by ID:", error);
    event.sender.send("deptByIdError", error.message);
  }
});

// Function to fetch expiring items from the database
async function fetchExpiringItems(query) {
  try {
    const expirationYear = 2024; // Change this to the desired year
    const queryString = `SELECT itemName, expire_date FROM items WHERE YEAR(expire_date) = ?`; // Ensure your query fits your database schema
    const results = await query(queryString, [expirationYear]);
    return results;
  } catch (error) {
    console.error("Error fetching expiring items:", error);
    return [];
  }
}

ipcMain.on("fetch-expiring-items", async (event) => {
  try {
    const expiringItems = await fetchExpiringItems(query);
    mainWindow.webContents.send("expiring-items-data", expiringItems);
  } catch (error) {
    console.error("Error handling fetch-expiring-items IPC event:", error);
    // Handle error as needed
  }
});

ipcMain.on("remove-sale", async (event, invoiceNumber) => {
  try {
    const sql = "DELETE FROM invoices WHERE InvoiceNumber = ?";
    await query(sql, [invoiceNumber]);
    event.sender.send("sale-removed", invoiceNumber);
  } catch (error) {
    console.error("Error removing sale:", error);
    event.sender.send("sale-remove-error", error.message);
  }
});
// Listen for the IPC event to fetch sales data for the chart
ipcMain.on("fetch-sales-data-chart", async (event) => {
  try {
    const query = `
    SELECT 
    MONTHNAME(timestamp) AS month,
    SUM(totalPrice) AS sales
FROM 
    invoices
GROUP BY 
    MONTHNAME(timestamp)

    `;

    pool.query(query, (error, rows) => {
      if (error) {
        console.error("Error executing SQL query:", error);
        event.reply("sales-data-error", "Error fetching sales data");
        return;
      }

      // Format the data as required for the chart
      const salesData = rows.map(({ month, sales }) => ({
        month,
        sales,
      }));

      event.reply("sales-data-chart", salesData);
    });
  } catch (error) {
    console.error("Error fetching sales data:", error);
    event.reply("sales-data-error", "Error fetching sales data");
  }
});

ipcMain.on("fetch-top-sales-items", async (event) => {
  try {
    const query = `
      SELECT 
        itemName,
        SUM(quantity) AS totalQuantity
      FROM 
        invoices
      GROUP BY 
        itemName
      ORDER BY 
        totalQuantity DESC
      LIMIT 
        5
    `;

    pool.query(query, (error, rows) => {
      if (error) {
        console.error("Error executing SQL query:", error);
        event.reply("top-sales-items-error", "Error fetching top sales items");
        return;
      }

      const topSalesItems = rows.map(({ itemName, totalQuantity }) => ({
        itemName,
        totalQuantity,
      }));

      event.reply("top-sales-items", topSalesItems);
    });
  } catch (error) {
    console.error("Error fetching top sales items:", error);
    event.reply("top-sales-items-error", "Error fetching top sales items");
  }
});
function fetchNamesFromDatabase(callback) {
  const query = "SELECT DISTINCT name FROM depts";

  pool.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching names from database:", error);
      return callback(error, null);
    }

    const names = results.map((row) => row.name);
    callback(null, names);
  });
}
