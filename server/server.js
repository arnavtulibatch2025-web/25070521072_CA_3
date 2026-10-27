import 'dotenv/config';
import http from 'node:http';
import { URL } from 'node:url';
import { ObjectId } from 'mongodb';
import { connectDatabase, getDatabase, closeDatabase } from './db.js';

const PORT = Number(process.env.PORT || 5000);
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-this-admin-key';
const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  res.setHeader('Vary', 'Origin');
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request body too large');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('Request body must be valid JSON'); }
}
function cleanText(value, max = 3000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function validateEvent(input) {
  const event = {
    title: cleanText(input.title, 120), category: cleanText(input.category, 40),
    description: cleanText(input.description, 3000), venue: cleanText(input.venue, 160),
    organizer: cleanText(input.organizer, 120), image: cleanText(input.image, 40) || 'event',
    capacity: Number(input.capacity || 100), startAt: new Date(input.startAt), endAt: new Date(input.endAt)
  };
  const errors = [];
  if (event.title.length < 3) errors.push('Title must be at least 3 characters.');
  if (!['Technical', 'Cultural', 'Sports', 'Workshop', 'Career', 'Competition', 'Other'].includes(event.category)) errors.push('Choose a valid category.');
  if (event.description.length < 10) errors.push('Description must be at least 10 characters.');
  if (event.venue.length < 2) errors.push('Venue is required.');
  if (event.organizer.length < 2) errors.push('Organizer is required.');
  if (Number.isNaN(event.startAt.getTime()) || Number.isNaN(event.endAt.getTime())) errors.push('Valid start and end dates are required.');
  else if (event.endAt <= event.startAt) errors.push('End date/time must be after start date/time.');
  if (!Number.isInteger(event.capacity) || event.capacity < 1 || event.capacity > 100000) errors.push('Capacity must be a whole number between 1 and 100000.');
  return { event, errors };
}
function isAdmin(req) { return Boolean(process.env.ADMIN_KEY) && req.headers['x-admin-key'] === ADMIN_KEY; }

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { status: 'ok', service: 'CampusConnect API' });
    if (path[0] !== 'api') return send(res, 404, { error: 'Route not found.' });
    const db = getDatabase();
    const events = db.collection('events');
    const registrations = db.collection('registrations');

    if (req.method === 'GET' && path[1] === 'events' && path.length === 2) {
      const query = cleanText(url.searchParams.get('q'), 100);
      const category = cleanText(url.searchParams.get('category'), 40);
      const filter = {};
      if (category && category !== 'All') filter.category = category;
      if (url.searchParams.get('upcoming') === 'true') filter.startAt = { $gte: new Date() };
      if (query) filter.$or = [
        { title: { $regex: escapeRegex(query), $options: 'i' } },
        { description: { $regex: escapeRegex(query), $options: 'i' } },
        { venue: { $regex: escapeRegex(query), $options: 'i' } },
        { organizer: { $regex: escapeRegex(query), $options: 'i' } }
      ];
      const result = await events.find(filter).sort({ startAt: 1 }).limit(200).toArray();
      const counts = await registrations.aggregate([{ $group: { _id: '$eventId', count: { $sum: 1 } } }]).toArray();
      const countMap = new Map(counts.map(item => [String(item._id), item.count]));
      return send(res, 200, result.map(e => ({ ...e, id: String(e._id), registrationCount: countMap.get(String(e._id)) || 0, _id: undefined })));
    }
    if (req.method === 'GET' && path[1] === 'events' && path.length === 3) {
      if (!ObjectId.isValid(path[2])) return send(res, 400, { error: 'Invalid event ID.' });
      const e = await events.findOne({ _id: new ObjectId(path[2]) });
      if (!e) return send(res, 404, { error: 'Event not found.' });
      const registrationCount = await registrations.countDocuments({ eventId: e._id });
      return send(res, 200, { ...e, id: String(e._id), registrationCount, _id: undefined });
    }
    if (req.method === 'POST' && path[1] === 'events' && path[3] === 'register') {
      if (!ObjectId.isValid(path[2])) return send(res, 400, { error: 'Invalid event ID.' });
      const event = await events.findOne({ _id: new ObjectId(path[2]) });
      if (!event) return send(res, 404, { error: 'Event not found.' });
      if (new Date(event.startAt) < new Date()) return send(res, 400, { error: 'Registration is closed for this event.' });
      const input = await body(req);
      const name = cleanText(input.name, 100);
      const email = cleanText(input.email, 160).toLowerCase();
      if (name.length < 2) return send(res, 400, { error: 'Please enter your full name.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Please enter a valid email address.' });
      const count = await registrations.countDocuments({ eventId: event._id });
      if (count >= event.capacity) return send(res, 409, { error: 'Sorry, this event is full.' });
      try {
        await registrations.insertOne({ eventId: event._id, name, email, createdAt: new Date() });
      } catch (err) {
        if (err.code === 11000) return send(res, 409, { error: 'This email is already registered for this event.' });
        throw err;
      }
      return send(res, 201, { message: 'Registration successful!', eventId: String(event._id) });
    }
    if (req.method === 'GET' && path[1] === 'events' && path[3] === 'registrations') {
      if (!ObjectId.isValid(path[2])) return send(res, 400, { error: 'Invalid event ID.' });
      const count = await registrations.countDocuments({ eventId: new ObjectId(path[2]) });
      return send(res, 200, { count });
    }
    if (path[1] === 'events' && path.length === 2 && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin key is missing or incorrect.' });
      const input = await body(req);
      const { event, errors } = validateEvent(input);
      if (errors.length) return send(res, 400, { error: errors.join(' ') });
      event.createdAt = new Date();
      const result = await events.insertOne(event);
      return send(res, 201, { message: 'Event created.', id: String(result.insertedId) });
    }
    if (path[1] === 'events' && path.length === 3 && req.method === 'PUT') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin key is missing or incorrect.' });
      if (!ObjectId.isValid(path[2])) return send(res, 400, { error: 'Invalid event ID.' });
      const input = await body(req);
      const { event, errors } = validateEvent(input);
      if (errors.length) return send(res, 400, { error: errors.join(' ') });
      const result = await events.updateOne({ _id: new ObjectId(path[2]) }, { $set: event });
      if (!result.matchedCount) return send(res, 404, { error: 'Event not found.' });
      return send(res, 200, { message: 'Event updated.' });
    }
    if (path[1] === 'events' && path.length === 3 && req.method === 'DELETE') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin key is missing or incorrect.' });
      if (!ObjectId.isValid(path[2])) return send(res, 400, { error: 'Invalid event ID.' });
      const id = new ObjectId(path[2]);
      const result = await events.deleteOne({ _id: id });
      if (!result.deletedCount) return send(res, 404, { error: 'Event not found.' });
      await registrations.deleteMany({ eventId: id });
      return send(res, 200, { message: 'Event deleted.' });
    }
    return send(res, 404, { error: 'Route not found.' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: err.message || 'Internal server error.' });
  }
});
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

await connectDatabase();
server.listen(PORT, () => console.log(`CampusConnect API running at http://localhost:${PORT}`));
process.on('SIGINT', async () => { server.close(); await closeDatabase(); process.exit(0); });
process.on('SIGTERM', async () => { server.close(); await closeDatabase(); process.exit(0); });
