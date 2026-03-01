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
    let xP = 0;
    const form = parseFloat(player.form) || 0;
    const pointsPerGame = parseFloat(player.points_per_game) || 0;
    const expectedGoals = parseFloat(player.expected_goals || 0);
    const expectedAssists = parseFloat(player.expected_assists || 0);
    const expectedGoalInvolvements = parseFloat(player.expected_goal_involvements || 0);
    const ictIndex = parseFloat(player.ict_index || 0);
    const influence = parseFloat(player.influence || 0);
    const creativity = parseFloat(player.creativity || 0);
    const threat = parseFloat(player.threat || 0);
    
    const minutesPlayed = parseInt(player.minutes || 0);
    const gamesStarted = parseInt(player.starts || 1);
    const avgMinutesPerGame = minutesPlayed / gamesStarted;
    
    let availabilityFactor = avgMinutesPerGame >= 60 ? 1.0 : avgMinutesPerGame >= 45 ? 0.75 : avgMinutesPerGame >= 30 ? 0.5 : avgMinutesPerGame > 0 ? 0.3 : 0.1;
    const chanceOfPlaying = parseInt(player.chance_of_playing_next_round || 100);
    if (chanceOfPlaying < 100) availabilityFactor *= (chanceOfPlaying / 100);
    
    if (form === 0 && pointsPerGame === 0 && ictIndex === 0) {
        return (player.total_points / Math.max(player.minutes / 90, 1) * numGameweeks) * availabilityFactor;
    }
    
    const playerFixtures = fixtures.filter(f => f.team === player.team && !f.finished).sort((a, b) => a.event - b.event).slice(0, numGameweeks);
    
    if (playerFixtures.length === 0) {
        const baseXP = form * 0.15 + pointsPerGame * 0.35 + (ictIndex / 20) * 0.5;
        return baseXP * numGameweeks * availabilityFactor;
    }
    
    const optaScore = (expectedGoals * 5) + (expectedAssists * 3) + (influence / 100) + (creativity / 100) + (threat / 100) + (ictIndex / 50);
    const isDefender = player.element_type === 2;
    const isGoalkeeper = player.element_type === 1;
    const cleanSheetsPerGame = player.clean_sheets / Math.max(player.starts || 1, 1);
    
    playerFixtures.forEach(fixture => {
        const difficulty = fixture.difficulty || 3;
        const formComponent = form * 0.1;
        const pointsPerGameComponent = pointsPerGame * 0.25;
        const optaComponent = optaScore * 0.4;
        const xGIComponent = isGoalkeeper ? 0 : (expectedGoalInvolvements * 0.25);
        
        let basePoints = formComponent + pointsPerGameComponent + optaComponent + xGIComponent;
        
        if (isDefender || isGoalkeeper) {
            let cleanSheetProbability = 0;
            if (difficulty <= 2) {
                cleanSheetProbability = 0.50 + (cleanSheetsPerGame * 0.3);
            } else if (difficulty === 3) {
                cleanSheetProbability = 0.30 + (cleanSheetsPerGame * 0.2);
            } else {
                cleanSheetProbability = 0.15 + (cleanSheetsPerGame * 0.1);
            }
            cleanSheetProbability = Math.min(Math.max(cleanSheetProbability, 0), 0.80);
            const expectedCleanSheetPoints = cleanSheetProbability * 4;
            
            if (isGoalkeeper) {
                const savesPerGame = player.saves / Math.max(player.starts || 1, 1);
                const expectedSavePoints = (savesPerGame / 3);
                basePoints += expectedSavePoints;
            }
            basePoints += expectedCleanSheetPoints;
        }
        
        const difficultyMultiplier = difficulty <= 2 ? 1.4 : difficulty <= 3 ? 1.0 : 0.65;
        xP += basePoints * difficultyMultiplier * availabilityFactor;
    });
    
    if (playerFixtures.length < numGameweeks && playerFixtures.length > 0) {
        const avgPerFixture = xP / playerFixtures.length;
        xP = avgPerFixture * numGameweeks;
    }
    
    return xP;
}
