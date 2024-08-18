const { ipcRenderer } = require("electron");

const salesReportTable = document.getElementById("salesReportTable");
const searchBar = document.getElementById("searchBar");
const totalProfitElement = document.getElementById("totalProfit");
const yearFilter = document.getElementById("yearFilter");
const monthFilter = document.getElementById("monthFilter");
const dayFilter = document.getElementById("dayFilter");

let salesData = [];

ipcRenderer.on("sales-data", (event, data) => {
  console.log("Received sales data:", data);
  if (Array.isArray(data)) {
    salesData = data;
    populateDateFilters();
    const filteredData = applyFilters(); // Filter data initially based on today's date
    updateSalesReportTable(filteredData);
    const totalProfit = filteredData.reduce((acc, sale) => acc + parseFloat(sale.profitPrice), 0);
    updateTotalProfitAndTotalProfitInLBP(totalProfit);
  } else {
    console.error("Invalid sales data format:", data);
  }
});

window.addEventListener("load", () => {
  ipcRenderer.send("fetch-sales-data");
});

function updateTotalProfit(profit) {
  if (typeof profit === "string") {
    profit = parseFloat(profit);
  }
  if (typeof profit === "number" && !isNaN(profit)) {
    totalProfitElement.textContent = `$${profit.toFixed(2)}`;
  } else {
    console.error("Profit is not a valid number:", profit);
  }
}

function updateSalesReportTable(data) {
  const salesReportTableBody = salesReportTable.querySelector("tbody");
  salesReportTableBody.innerHTML = "";

  if (data.length === 0) {
    salesReportTableBody.innerHTML = '<tr><td colspan="9">No matching data</td></tr>';
    updateTotalProfit(0);
    updateTotalSellPrice(0);
    return;
  }

  let totalProfit = 0;
  let totalSellPrice = 0;

  // Sort data based on invoice number in descending order
  data.sort((a, b) => b.InvoiceNumber - a.InvoiceNumber);

  // Iterate over sorted data to update the table
  data.forEach((sale) => {
    const timestamp = sale.latestTimestamp ? new Date(sale.latestTimestamp) : new Date();
    const formattedTimestamp = timestamp.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const row = salesReportTableBody.insertRow();
    row.insertCell(0).textContent = sale.InvoiceNumber;
    row.insertCell(1).textContent = sale.itemNames;
    row.insertCell(2).textContent = parseFloat(sale.totalQuantity).toFixed(2);
    row.insertCell(3).textContent = parseFloat(sale.totalSales).toFixed(2);
    totalSellPrice += parseFloat(sale.totalSales);
    row.insertCell(4).textContent =   parseFloat(sale.totalSales - sale.profitPrice).toFixed(2);
    row.insertCell(5).textContent = parseFloat(sale.profitPrice).toFixed(2);
    row.insertCell(6).textContent = formattedTimestamp;
    const removeButton = document.createElement("button");
    removeButton.textContent = "إزالة";
    removeButton.onclick = () => removeRow(sale.InvoiceNumber);
    row.insertCell(7).appendChild(removeButton);

    totalProfit += parseFloat(sale.profitPrice);
  });

  updateTotalProfit(totalProfit.toFixed(2));
  updateTotalSellPrice(totalSellPrice.toFixed(2));
}

function applyFilters() {
  const selectedYear = yearFilter.value;
  const selectedMonth = monthFilter.value;
  const selectedDay = dayFilter.value;
  const searchTerm = searchBar.value.trim().toLowerCase();

  let filteredData = salesData.filter((sale) => {
    const saleDate = new Date(sale.latestTimestamp);
    const saleYear = saleDate.getFullYear().toString();
    const saleMonth = (saleDate.getMonth() + 1).toString();
    const saleDay = saleDate.getDate().toString();

    const saleItemNames = sale.itemNames.toLowerCase();
    const saleInvoiceNumber = sale.InvoiceNumber.toLowerCase();
    const saleDoctorName = sale.customer_name ? sale.customer_name.toLowerCase() : "";

    const yearFilterMatch = selectedYear === "" || saleYear === selectedYear;
    const monthFilterMatch = selectedMonth === "" || saleMonth === selectedMonth;
    const dayFilterMatch = selectedDay === "" || saleDay === selectedDay;
    const invoiceNumberMatch = saleInvoiceNumber.includes(searchTerm);
    const itemNameMatch = saleItemNames.includes(searchTerm);
    const doctorNameMatch = saleDoctorName.includes(searchTerm);

    const searchFilterMatch =
      searchTerm === "" ||
      (isNaN(searchTerm)
        ? itemNameMatch || doctorNameMatch
        : invoiceNumberMatch);

    return yearFilterMatch && monthFilterMatch && dayFilterMatch && searchFilterMatch;
  });

  return filteredData;
}

function handleFilterChange() {
  const filteredData = applyFilters();
  updateSalesReportTable(filteredData);
  const totalProfit = filteredData.reduce((acc, sale) => acc + parseFloat(sale.profitPrice), 0);
  updateTotalProfitAndTotalProfitInLBP(totalProfit);
}

// Update event listeners to trigger the filtering process
yearFilter.addEventListener("change", handleFilterChange);
monthFilter.addEventListener("change", handleFilterChange);
dayFilter.addEventListener("change", handleFilterChange);
searchBar.addEventListener("input", debounce(handleFilterChange, 300));

function debounce(func, delay) {
  let timeout;
  return function () {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

function populateComboBox(comboBox, options, defaultValue = "") {
  comboBox.innerHTML = '<option value="">--</option>';
  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.toString();
    optionElement.textContent = option.toString();
    if (option.toString() === defaultValue) {
      optionElement.selected = true;
    }
    comboBox.appendChild(optionElement);
  });
}

function populateDateFilters() {
  const currentDate = new Date();
  const years = Array.from(new Set(salesData.map((sale) => new Date(sale.latestTimestamp).getFullYear())));
  const months = Array.from(new Set(salesData.map((sale) => new Date(sale.latestTimestamp).getMonth() + 1)));
  const days = Array.from(new Set(salesData.map((sale) => new Date(sale.latestTimestamp).getDate())));

  const defaultYear = currentDate.getFullYear().toString();
  const defaultMonth = (currentDate.getMonth() + 1).toString();
  const defaultDay = currentDate.getDate().toString();

  populateComboBox(yearFilter, years, defaultYear);
  populateComboBox(monthFilter, months, defaultMonth);
  populateComboBox(dayFilter, days, defaultDay);
}

function goBack() {
  console.log("Navigating back to Home.html");
  window.location.href = "Home.html";
}

function resetFilters() {
  yearFilter.value = "";
  monthFilter.value = "";
  dayFilter.value = "";
  searchBar.value = "";
  ipcRenderer.send("fetch-sales-data");
}

function readExchangeRate(callback) {
  const fs = require('fs');
  fs.readFile('rate.json', 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading file:', err);
      callback(null);
      return;
    }
    const exchangeRateObj = JSON.parse(data);
    const exchangeRate = exchangeRateObj.exchange_rate;
    callback(exchangeRate);
  });
}

function updateTotalProfitInLBPDisplay(totalProfitInLBP) {
  const formattedTotalProfitInLBP = totalProfitInLBP.toLocaleString('en-US');
  const totalProfitInLBPButton = document.getElementById('totalProfitInLBP');
  totalProfitInLBPButton.textContent = `${formattedTotalProfitInLBP} LBP`;
}

function updateTotalProfitDisplay(totalProfit) {
  totalProfitElement.textContent = `$${totalProfit.toFixed(2)}`;
}

function updateTotalProfitAndTotalProfitInLBP(totalProfit) {
  readExchangeRate((exchangeRate) => {
    if (exchangeRate !== null && !isNaN(exchangeRate)) {
      const totalProfitInLBP = totalProfit * exchangeRate;
      console.log('Total profit in USD:', totalProfit);
      console.log('Exchange rate:', exchangeRate);
      console.log('Total profit in LBP:', totalProfitInLBP);
      updateTotalProfitDisplay(totalProfit);
      updateTotalProfitInLBPDisplay(totalProfitInLBP);
    } else {
      console.error('Failed to read exchange rate or exchange rate is not a number.');
    }
  });
}

function removeRow(invoiceNumber) {
  ipcRenderer.send("remove-sale", invoiceNumber);
}

ipcRenderer.on("sale-removed", (event, removedInvoiceNumber) => {
  const filteredData = salesData.filter((sale) => sale.InvoiceNumber !== removedInvoiceNumber);
  salesData = filteredData;
  updateSalesReportTable(filteredData);
  const totalProfit = filteredData.reduce((acc, sale) => acc + parseFloat(sale.profitPrice), 0);
  updateTotalProfitAndTotalProfitInLBP(totalProfit);
});

ipcRenderer.on("sale-remove-error", (event, errorMessage) => {
  console.error("Error removing sale:", errorMessage);
});

function updateTotalSellPrice(totalSellPrice) {
  const totalSellPriceElement = document.getElementById("totalSellPrice");
  totalSellPriceElement.textContent = `$${totalSellPrice}`;
}
