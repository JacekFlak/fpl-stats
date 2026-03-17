/**
 * Unified Expected Points (xP) Calculation Algorithm
 * Used across all FPL Stats pages for consistent player performance predictions
 * 
 * Algorithm Components:
 * - Opta Professional Statistics: xG, xA, Influence, Creativity, Threat, ICT Index
 * - Player Form: Recent performance trend
 * - Points Per Game: Historical average scoring
 * - Fixture Difficulty: Strength of upcoming opponents (1-5 scale)
 * - Availability Factor: Playing time and injury status
 */

/**
 * Calculate Expected Points for a player over upcoming gameweeks
 * @param {Object} player - Player data from FPL API
 * @param {Array} fixtures - All fixtures data
 * @param {number} numGameweeks - Number of gameweeks to project (default: 5)
 * @returns {number} Expected Points total
 */
function calculateExpectedPoints(player, fixtures, numGameweeks = 5) {
    const form = parseFloat(player.form) || 0;
    const pointsPerGame = parseFloat(player.points_per_game) || 0;
    const gamesStarted = Math.max(parseInt(player.starts || 0), 1);
    const minutesPlayed = parseInt(player.minutes || 0);
    const avgMinutesPerGame = minutesPlayed / gamesStarted;

    // Availability factor based on average playing time.
    let availabilityFactor = avgMinutesPerGame >= 60 ? 1.0
                           : avgMinutesPerGame >= 45 ? 0.75
                           : avgMinutesPerGame >= 30 ? 0.5
                           : avgMinutesPerGame > 0  ? 0.3
                           : 0.1;
    const chanceOfPlaying = parseInt(player.chance_of_playing_next_round || 100);
    if (chanceOfPlaying < 100) availabilityFactor *= chanceOfPlaying / 100;

    // Normalize cumulative season Opta stats → per-game rates.
    const xGIPerGame  = parseFloat(player.expected_goal_involvements || 0) / gamesStarted;
    const ictPerGame  = parseFloat(player.ict_index   || 0) / gamesStarted;
    const xGPerGame   = parseFloat(player.expected_goals   || 0) / gamesStarted;
    const xAPerGame   = parseFloat(player.expected_assists || 0) / gamesStarted;
    const infPerGame  = parseFloat(player.influence   || 0) / gamesStarted;
    const crePerGame  = parseFloat(player.creativity  || 0) / gamesStarted;
    const thrPerGame  = parseFloat(player.threat      || 0) / gamesStarted;

    // Handle raw API fixtures (team_h / team_a) and pre-mapped fixtures (team / difficulty).
    const allTeamFixtures = fixtures
        .filter(f => {
            const inTeam = f.team === player.team
                        || f.team_h === player.team
                        || f.team_a === player.team;
            return inTeam && !f.finished && f.event != null;
        })
        .map(f => {
            if (f.difficulty != null) return f; // already mapped
            const isHome = f.team_h === player.team;
            return {
                ...f,
                team: player.team,
                difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty
            };
        })
        .sort((a, b) => a.event - b.event);

    // No fixtures at all → form-based estimate.
    if (allTeamFixtures.length === 0) {
        const baseXP = form * 0.35 + pointsPerGame * 0.40 + ictPerGame * 0.25;
        return baseXP * numGameweeks * availabilityFactor;
    }

    // Collect the next numGameweeks distinct events (supporting DGW: multiple fixtures per event).
    const eventsSeen = [];
    const playerFixtures = [];
    for (const f of allTeamFixtures) {
        if (!eventsSeen.includes(f.event)) {
            if (eventsSeen.length >= numGameweeks) break;
            eventsSeen.push(f.event);
        }
        playerFixtures.push(f);
    }

    const isDefender   = player.element_type === 2;
    const isGoalkeeper = player.element_type === 1;
    const cleanSheetsPerGame = parseFloat(player.clean_sheets || 0) / gamesStarted;
    const savesPerGame = parseFloat(player.saves || 0) / gamesStarted;

    // Per-game Opta composite (all values already per-game).
    const optaPerGame = (xGPerGame * 5) + (xAPerGame * 3)
                      + (infPerGame / 100) + (crePerGame / 100)
                      + (thrPerGame / 100) + (ictPerGame / 50);

    let xP = 0;
    playerFixtures.forEach(fixture => {
        const difficulty = fixture.difficulty || 3;

        // Weights: form 35 % · PPG 30 % · Opta 20 % · xGI 15 %
        const formComponent   = form         * 0.35;
        const ppgComponent    = pointsPerGame * 0.30;
        const optaComponent   = optaPerGame  * 0.20;
        const xGIComponent    = isGoalkeeper ? 0 : xGIPerGame * 0.15;

        let basePoints = formComponent + ppgComponent + optaComponent + xGIComponent;

        // Defensive / goalkeeper bonuses.
        if (isDefender || isGoalkeeper) {
            let csp = difficulty <= 2 ? 0.50 + cleanSheetsPerGame * 0.3
                    : difficulty === 3 ? 0.30 + cleanSheetsPerGame * 0.2
                    : 0.15 + cleanSheetsPerGame * 0.1;
            csp = Math.min(Math.max(csp, 0), 0.80);
            basePoints += csp * 4;
            if (isGoalkeeper) basePoints += savesPerGame / 3;
        }

        const diffMult = difficulty <= 2 ? 1.35
                       : difficulty === 3 ? 1.0
                       : difficulty === 4 ? 0.70
                       : 0.55;
        xP += basePoints * diffMult * availabilityFactor;
    });

    // If fewer fixtures found than requested GWs, extrapolate by average.
    const eventsFound = eventsSeen.length;
    if (eventsFound < numGameweeks && eventsFound > 0) {
        xP = (xP / eventsFound) * numGameweeks;
    }

    return xP;
}
