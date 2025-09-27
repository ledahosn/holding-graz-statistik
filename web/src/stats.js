// --- HTML Template for the Statistics View ---
const statsTemplate = `
  <div class="bg-white shadow-md rounded-lg p-6">
    <h1 class="text-2xl font-bold text-gray-800 mb-4">Line Performance Statistics</h1>
    
    <form id="stats-form" class="flex flex-col md:flex-row gap-4 items-center mb-6 p-4 bg-gray-50 rounded-lg">
      <div class="w-full md:w-1/2">
        <label for="line-select" class="block text-sm font-medium text-gray-700">Select a Line</label>
        <select id="line-select" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
          <option>Loading lines...</option>
        </select>
      </div>
      <div class="w-full md:w-1/4">
        <label for="date-select" class="block text-sm font-medium text-gray-700">Date</label>
        <input type="date" id="date-select" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
      </div>
      <div class="w-full md:w-1/4">
         <button type="submit" class="w-full mt-6 inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
            Get Stats
         </button>
      </div>
    </form>

    <div id="stats-result" class="mt-4">
        <p class="text-gray-500">Please select a line and date to view statistics.</p>
    </div>
  </div>
`;

function renderStatsTable(data, container) {
    if (data.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No data available for the selected criteria.</p>';
        return;
    }

    const tableRows = data.map(row => {
        const interval = new Date(row.interval_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const avgDelay = parseFloat(row.avg_delay_seconds).toFixed(0);
        return `
            <tr class="border-b">
                <td class="p-2">${interval}</td>
                <td class="p-2">${avgDelay} seconds</td>
                <td class="p-2">${row.event_count}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="w-full text-left table-auto">
            <thead class="bg-gray-100">
                <tr>
                    <th class="p-2">Time Interval</th>
                    <th class="p-2">Average Delay</th>
                    <th class="p-2">Vehicle Reports</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>
    `;
}

export async function initStats(container) {
    container.innerHTML = statsTemplate;

    const lineSelect = document.getElementById('line-select');
    const dateSelect = document.getElementById('date-select');
    const form = document.getElementById('stats-form');
    const resultContainer = document.getElementById('stats-result');

    // Set default date to today
    dateSelect.value = new Date().toISOString().split('T')[0];

    // Fetch and populate lines
    try {
        const response = await fetch('http://localhost:3001/api/lines');
        const lines = await response.json();
        lineSelect.innerHTML = '<option value="">-- Please choose a line --</option>'; // Clear loading message
        lines.forEach(line => {
            const option = document.createElement('option');
            option.value = line.line_id;
            option.textContent = `(${line.product}) ${line.line_name}`;
            lineSelect.appendChild(option);
        });
    } catch (error) {
        lineSelect.innerHTML = '<option>Failed to load lines</option>';
        console.error("Failed to fetch lines:", error);
    }

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const lineId = lineSelect.value;
        const date = dateSelect.value;

        if (!lineId || !date) {
            resultContainer.innerHTML = '<p class="text-red-500">Please select a line and a date.</p>';
            return;
        }

        resultContainer.innerHTML = '<p class="text-gray-500">Loading statistics...</p>';

        try {
            const response = await fetch(`http://localhost:3001/api/stats/line/${lineId}?date=${date}`);
            const stats = await response.json();
            renderStatsTable(stats, resultContainer);
        } catch (error) {
            resultContainer.innerHTML = '<p class="text-red-500">Failed to load statistics.</p>';
            console.error("Failed to fetch stats:", error);
        }
    });
}