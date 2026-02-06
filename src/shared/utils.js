// Shared utility functions

export function generateId() {
  // Simple UUID v4 generator for browser/node compatibility
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function getRandomSeed() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function createPlayerDisplayName(name, position) {
  return name || `Player ${position + 1}`;
}

export function formatChips(amount) {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toString();
}

export function createInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function getNextPosition(currentPosition, maxPlayers, direction = 1) {
  return (currentPosition + direction + maxPlayers) % maxPlayers;
}

export function calculateTimeRemaining(startTime, maxTime) {
  const elapsed = Date.now() - startTime;
  return Math.max(0, maxTime - elapsed);
}

// Hand ranking utilities
export function getHandRank(cards) {
  const ranks = cards.map(card => card.value).sort((a, b) => b - a);
  const suits = cards.map(card => card.suit);
  
  // Check for flush
  const isFlush = suits.every(suit => suit === suits[0]);
  
  // Check for straight
  const isStraight = ranks.every((rank, index) => 
    index === 0 || rank === ranks[index - 1] - 1
  );
  
  // Special case: A-2-3-4-5 straight (wheel)
  const isWheel = ranks.join(',') === '14,5,4,3,2';
  
  // Count rank frequencies
  const rankCounts = {};
  ranks.forEach(rank => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });
  
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  
  // Determine hand type
  if (isFlush && (isStraight || isWheel)) {
    return { type: 'straight-flush', value: 8, high: isWheel ? 5 : ranks[0] };
  } else if (counts[0] === 4) {
    return { type: 'four-of-a-kind', value: 7, high: Object.keys(rankCounts).find(k => rankCounts[k] === 4) };
  } else if (counts[0] === 3 && counts[1] === 2) {
    return { type: 'full-house', value: 6, high: Object.keys(rankCounts).find(k => rankCounts[k] === 3) };
  } else if (isFlush) {
    return { type: 'flush', value: 5, high: ranks[0] };
  } else if (isStraight || isWheel) {
    return { type: 'straight', value: 4, high: isWheel ? 5 : ranks[0] };
  } else if (counts[0] === 3) {
    return { type: 'three-of-a-kind', value: 3, high: Object.keys(rankCounts).find(k => rankCounts[k] === 3) };
  } else if (counts[0] === 2 && counts[1] === 2) {
    return { type: 'two-pair', value: 2, high: Math.max(...Object.keys(rankCounts).filter(k => rankCounts[k] === 2)) };
  } else if (counts[0] === 2) {
    return { type: 'pair', value: 1, high: Object.keys(rankCounts).find(k => rankCounts[k] === 2) };
  } else {
    return { type: 'high-card', value: 0, high: ranks[0] };
  }
}

export function findBestHand(holeCards, communityCards) {
  // Generate all possible 5-card combinations from 7 cards
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    return { cards: allCards, rank: getHandRank(allCards) };
  }
  
  const combinations = [];
  
  // Generate all 5-card combinations from 7 cards
  for (let i = 0; i < allCards.length - 4; i++) {
    for (let j = i + 1; j < allCards.length - 3; j++) {
      for (let k = j + 1; k < allCards.length - 2; k++) {
        for (let l = k + 1; l < allCards.length - 1; l++) {
          for (let m = l + 1; m < allCards.length; m++) {
            combinations.push([allCards[i], allCards[j], allCards[k], allCards[l], allCards[m]]);
          }
        }
      }
    }
  }
  
  // Find the best hand
  let bestHand = combinations[0];
  let bestRank = getHandRank(bestHand);
  
  for (const hand of combinations) {
    const rank = getHandRank(hand);
    if (rank.value > bestRank.value || 
        (rank.value === bestRank.value && rank.high > bestRank.high)) {
      bestHand = hand;
      bestRank = rank;
    }
  }
  
  return { cards: bestHand, rank: bestRank };
}