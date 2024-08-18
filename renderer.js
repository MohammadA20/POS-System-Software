const { ipcRenderer } = require('electron');

// Request sales data when the page loads
window.onload = () => {
  ipcRenderer.send("fetch-sales-data-chart");
};

// Listen for the sales data
ipcRenderer.on("sales-data-chart", (event, salesData) => {
  const months = salesData.map(data => data.month);
  const salesValues = salesData.map(data => data.sales);

  // Create a bar chart using Chart.js
  const ctx = document.getElementById('salesChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Sales Growth',
        data: salesValues,
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
});

function goBack() {
  console.log("Returning to the main page");
  window.location.href = "showdepts.html";
}
