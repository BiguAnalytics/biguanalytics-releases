// @ts-check
const { v4: uuidv4 } = require('uuid');
const { getMatchById, updateMatch } = require('./storage');

/**
 * Adds an event to a match
 * @param {string} matchId
 * @param {object} eventData
 * @returns {Promise<object>}
 */
async function addEvent(matchId, eventData) {
  const match = await getMatchById(matchId);
  
  const newEvent = {
    timestamp: null,
    type: '',
    team: null,
    result: '',
    subtype: '',
    note: '',
    zone: null,
    ...eventData,
    id: uuidv4(),
    createdAt: new Date().toISOString()
  };

  const updatedEvents = [...(match.events || []), newEvent];
  await updateMatch(matchId, {
    events: updatedEvents,
    status: match.status === 'created' ? 'tagging' : match.status
  });

  return newEvent;
}

/**
 * Updates an existing event
 * @param {string} matchId
 * @param {string} eventId
 * @param {object} updates
 * @returns {Promise<object>}
 */
async function updateEvent(matchId, eventId, updates) {
  const match = await getMatchById(matchId);
  
  const eventIndex = (match.events || []).findIndex(e => e.id === eventId);
  if (eventIndex === -1) {
    throw new Error('Event not found');
  }

  const updatedEvents = [...match.events];
  updatedEvents[eventIndex] = {
    ...updatedEvents[eventIndex],
    ...updates
  };

  await updateMatch(matchId, { events: updatedEvents });

  return updatedEvents[eventIndex];
}

/**
 * Deletes an event
 * @param {string} matchId
 * @param {string} eventId
 * @returns {Promise<void>}
 */
async function deleteEvent(matchId, eventId) {
  const match = await getMatchById(matchId);
  
  const updatedEvents = (match.events || []).filter(e => e.id !== eventId);
  await updateMatch(matchId, { events: updatedEvents });
}

module.exports = {
  addEvent,
  updateEvent,
  deleteEvent
};
