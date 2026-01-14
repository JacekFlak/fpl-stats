let TEAM_ID = 8668;
const API_BASE = 'https://fantasy.premierleague.com/api';

async function fetchWithProxy(url) {
    // Lista proxy do wypróbowania
    const proxies = [
        '', // First try without proxy
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
    ];

    for (let i = 0; i < proxies.length; i++) {
        try {
            const proxyUrl = proxies[i] ? `${proxies[i]}${encodeURIComponent(url)}` : url;
            console.log(`Attempt ${i + 1}: ${proxies[i] ? 'with proxy' : 'direct'}`);
            
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                mode: proxies[i] ? 'cors' : 'cors',
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Success!');
            return data;
        } catch (error) {
            console.log(`Attempt ${i + 1} failed:`, error.message);
            if (i === proxies.length - 1) {
                throw error;
            }
        }
    }
}

async function fetchTeamData() {
    try {
        console.log('Fetching team data...');
        
        // Fetch team data
        const teamData = await fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/`);
        console.log('Team data fetched:', teamData);

        // Fetch history
        const historyData = await fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/history/`);
        console.log('History fetched:', historyData);

        // Fetch bootstrap-static for global averages and players
        const bootstrapData = await fetchWithProxy(`${API_BASE}/bootstrap-static/`);
        console.log('Bootstrap data fetched');

        // Fetch captain info for TC chips
        const tcChips = historyData.chips.filter(chip => chip.name === '3xc');
        const captainData = {};
        
        for (const chip of tcChips) {
            try {
                const gwPicks = await fetchWithProxy(`${API_BASE}/entry/${TEAM_ID}/event/${chip.event}/picks/`);
                const captain = gwPicks.picks.find(pick => pick.is_captain);
                if (captain) {
                    const player = bootstrapData.elements.find(el => el.id === captain.element);
                    if (player) {
                        captainData[chip.event] = player.web_name;
                    }
                }
            } catch (error) {
                console.log(`Could not fetch captain for GW${chip.event}`);
            }
        }

        return { team: teamData, history: historyData, bootstrap: bootstrapData, captainData };
    } catch (error) {
        console.error('Error details:', error);
        throw error;
    }
}

function displayTeamData(data) {
    const { team, history, bootstrap, captainData } = data;

    // Nazwa drużyny
    document.getElementById('teamName').textContent = team.name;

    // Określ zmianę rankingu (porównanie ostatniej i przedostatniej kolejki)
    let overallRankClass = 'rank';
    if (history.current.length >= 2) {
        const lastGW = history.current[history.current.length - 1];
        const prevGW = history.current[history.current.length - 2];
        console.log('Last GW rank:', lastGW.overall_rank, 'Previous GW rank:', prevGW.overall_rank);
        console.log('Summary overall rank:', team.summary_overall_rank);
        
        if (lastGW.overall_rank < prevGW.overall_rank) {
            overallRankClass = 'rank positive'; // Poprawa (niższy numer = lepiej)
            console.log('Rank improved - GREEN');
        } else if (lastGW.overall_rank > prevGW.overall_rank) {
            overallRankClass = 'rank negative'; // Pogorszenie (wyższy numer = gorzej)
            console.log('Rank worsened - RED');
        }
    }

    // Basic statistics
    const stats = [
        { label: 'Overall Points', value: team.summary_overall_points, class: '' },
        { label: 'Overall Rank', value: team.summary_overall_rank?.toLocaleString() || 'N/A', class: overallRankClass },
        { label: 'GW Points', value: team.summary_event_points || 0, class: '' },
        { label: 'GW Rank', value: team.summary_event_rank?.toLocaleString() || 'N/A', class: '' },
        { label: 'Team Value', value: `£${(team.last_deadline_value / 10).toFixed(1)}m`, class: '' },
        { label: 'Bank Value', value: `£${(team.last_deadline_bank / 10).toFixed(1)}m`, class: '' }
    ];

    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = stats.map(stat => `
        <div class="stat-card">
            <div class="stat-label">${stat.label}</div>
            <div class="stat-value ${stat.class}">${stat.value}</div>
        </div>
    `).join('');

    // Manager information
    const managerInfo = document.getElementById('managerInfo');
    managerInfo.innerHTML = `
        <div class="info-item">
            <span class="info-label">Manager</span>
            <span class="info-value">${team.player_first_name} ${team.player_last_name}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Region</span>
            <span class="info-value">${team.player_region_name || 'N/A'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Favourite Team</span>
            <span class="info-value">${team.favourite_team ? getTeamName(team.favourite_team) : 'N/A'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Started Gameweek</span>
            <span class="info-value">${team.started_event || 1}</span>
        </div>
    `;

    // Historia sezonowa - wszystkie kolejki
    const historyBody = document.getElementById('historyBody');
    const allHistory = [...history.current].reverse();
    
    // Create a map of chips by gameweek for quick lookup
    const chipsByGameweek = {};
    history.chips.forEach(chip => {
        let chipDisplay = getChipShortName(chip.name);
        // Add captain name for Triple Captain
        if (chip.name === '3xc' && captainData[chip.event]) {
            chipDisplay += ` (${captainData[chip.event]})`;
        }
        chipsByGameweek[chip.event] = chipDisplay;
    });
    
    historyBody.innerHTML = allHistory.map((gw, index) => {
        const transferCost = gw.event_transfers_cost;
        const transferClass = transferCost > 0 ? 'negative' : '';
        const transfersMade = gw.event_transfers || 0;
        
        // Określ kolor dla rankingu (porównanie z poprzednią kolejką)
        let rankClass = '';
        if (index < allHistory.length - 1) {
            const prevRank = allHistory[index + 1].overall_rank;
            const currentRank = gw.overall_rank;
            if (currentRank < prevRank) {
                rankClass = 'positive'; // Poprawa (niższy ranking = lepsza pozycja)
            } else if (currentRank > prevRank) {
                rankClass = 'negative'; // Pogorszenie (wyższy ranking = gorsza pozycja)
            }
        }
        
        // Get chip used in this gameweek
        const chipUsed = chipsByGameweek[gw.event] || '-';
        
        return `
            <tr>
                <td><strong>GW ${gw.event}</strong></td>
                <td><strong>${gw.points}</strong></td>
                <td>${gw.points_on_bench}</td>
                <td>£${(gw.value / 10).toFixed(1)}m</td>
                <td class="${rankClass}">${gw.overall_rank.toLocaleString()}</td>
                <td>${transfersMade}</td>
                <td class="${transferClass}">${transferCost > 0 ? `-${transferCost}` : '0'}</td>
                <td><strong>${chipUsed}</strong></td>
            </tr>
        `;
    }).join('');

    // Chips
    const chips = history.chips;
    const chipsDiv = document.getElementById('chips');
    if (chips.length > 0) {
        chipsDiv.innerHTML = chips.map(chip => 
            `<span class="chip used">${getChipShortName(chip.name)} - GW${chip.event}</span>`
        ).join('');
    } else {
        chipsDiv.innerHTML = '<p>No chips used this season yet.</p>';
    }

    // Wykres punktów
    createPointsChart(history.current, bootstrap);

    // Wykres rankingu
    createRankingChart(history.current);

    // Ukryj loading, pokaż content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

function createRankingChart(historyData) {
    const ctx = document.getElementById('rankingChart').getContext('2d');
    
    const labels = historyData.map(gw => `GW${gw.event}`);
    const rankings = historyData.map(gw => gw.overall_rank);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ranking Position',
                data: rankings,
                borderColor: '#04f5ff',
                backgroundColor: 'rgba(4, 245, 255, 0.1)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#04f5ff',
                pointBorderColor: '#37003c',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#37003c',
                    titleColor: '#04f5ff',
                    bodyColor: '#fff',
                    borderColor: '#04f5ff',
                    borderWidth: 2,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Rank: ${context.parsed.y.toLocaleString()}`;
                        },
                        afterLabel: function(context) {
                            const currentRank = context.parsed.y;
                            const prevIndex = context.dataIndex - 1;
                            if (prevIndex >= 0) {
                                const prevRank = rankings[prevIndex];
                                const change = prevRank - currentRank;
                                if (change > 0) {
                                    return `↑ Up ${change.toLocaleString()} places`;
                                } else if (change < 0) {
                                    return `↓ Down ${Math.abs(change).toLocaleString()} places`;
                                } else {
                                    return '→ No change';
                                }
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    reverse: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#37003c',
                        font: {
                            size: 12
                        },
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    },
                    title: {
                        display: true,
                        text: 'Position (lower = better)',
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#37003c',
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    title: {
                        display: true,
                        text: 'Gameweek',
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                }
            }
        }
    });
}

function createPointsChart(historyData, bootstrapData) {
    const ctx = document.getElementById('pointsChart').getContext('2d');
    
    const labels = historyData.map(gw => `GW${gw.event}`);
    const points = historyData.map(gw => gw.points);
    
    // Get global average for each gameweek from bootstrap data
    const eventsMap = {};
    bootstrapData.events.forEach(event => {
        eventsMap[event.id] = event.average_entry_score;
    });
    
    // Map the global average to each of the player's gameweeks
    const globalAverages = historyData.map(gw => eventsMap[gw.event] || 0);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Your Points',
                data: points,
                borderColor: '#00ff87',
                backgroundColor: 'rgba(0, 255, 135, 0.1)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#00ff87',
                pointBorderColor: '#37003c',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }, {
                label: 'Global Average',
                data: globalAverages,
                borderColor: '#04f5ff',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#04f5ff',
                pointBorderColor: '#37003c',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#37003c',
                    titleColor: '#00ff87',
                    bodyColor: '#fff',
                    borderColor: '#00ff87',
                    borderWidth: 2,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 0) {
                                return `Points: ${context.parsed.y}`;
                            } else {
                                return `Average: ${context.parsed.y.toFixed(1)}`;
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#37003c',
                        font: {
                            size: 12
                        }
                    },
                    title: {
                        display: true,
                        text: 'Points',
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#37003c',
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    title: {
                        display: true,
                        text: 'Gameweek',
                        color: '#37003c',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                }
            }
        }
    });
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    const errorDiv = document.getElementById('error');
    errorDiv.innerHTML = `
        <strong>Data Loading Error</strong><br>
        ${message}<br><br>
        <small>If the problem persists, try:<br>
        - Refresh the page (F5)<br>
        - Check your internet connection<br>
        - Check browser console (F12) for error details</small>
    `;
    errorDiv.style.display = 'block';
}

function getTeamName(teamId) {
    const teams = {
        1: 'Arsenal', 2: 'Aston Villa', 3: 'Bournemouth', 4: 'Brentford',
        5: 'Brighton', 6: 'Chelsea', 7: 'Crystal Palace', 8: 'Everton',
        9: 'Fulham', 10: 'Ipswich', 11: 'Leicester', 12: 'Liverpool',
        13: 'Man City', 14: 'Man Utd', 15: 'Newcastle', 16: 'Nott\'m Forest',
        17: 'Southampton', 18: 'Spurs', 19: 'West Ham', 20: 'Wolves'
    };
    return teams[teamId] || 'N/A';
}

function getChipShortName(chipName) {
    const chipMap = {
        'wildcard': 'WC',
        'bboost': 'BB',
        '3xc': 'TC',
        'freehit': 'FH'
    };
    return chipMap[chipName] || chipName;
}

// Load team by ID
async function loadTeamById() {
    const input = document.getElementById('teamIdInput');
    const newTeamId = parseInt(input.value);
    
    if (!newTeamId || newTeamId < 1) {
        alert('Please enter a valid Team ID');
        return;
    }
    
    TEAM_ID = newTeamId;
    
    // Reset display
    document.getElementById('teamName').textContent = 'Loading...';
    document.getElementById('content').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    // Clear previous chart instances
    const pointsChart = Chart.getChart('pointsChart');
    if (pointsChart) pointsChart.destroy();
    const rankingChart = Chart.getChart('rankingChart');
    if (rankingChart) rankingChart.destroy();
    
    try {
        console.log(`Loading data for team ID: ${TEAM_ID}`);
        const data = await fetchTeamData();
        displayTeamData(data);
    } catch (error) {
        console.error('Full error:', error);
        let errorMessage = 'An error occurred while loading data. ';
        
        if (error.message.includes('HTTP: 404')) {
            errorMessage += `Team with ID ${TEAM_ID} not found. Please check if the ID is correct.`;
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMessage += 'Network connection problem. Check your internet connection.';
        } else {
            errorMessage += error.message || 'Unknown error.';
        }
        
        showError(errorMessage);
    }
}

// Scroll to top functionality
const scrollToTopBtn = document.getElementById('scrollToTop');

window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Initialization
window.addEventListener('DOMContentLoaded', async () => {
    // Allow Enter key to search
    document.getElementById('teamIdInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loadTeamById();
        }
    });
    
    // Load initial team
    await loadTeamById();
});
