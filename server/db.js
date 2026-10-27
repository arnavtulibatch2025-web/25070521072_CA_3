import { MongoClient } from 'mongodb';

let client;
let database;

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured. Copy server/.env.example to server/.env.');
  client = new MongoClient(uri);
  await client.connect();
  database = client.db();
  await database.collection('events').createIndex({ startAt: 1 });
  await database.collection('events').createIndex({ title: 'text', description: 'text', venue: 'text' });
  await database.collection('registrations').createIndex({ eventId: 1, email: 1 }, { unique: true });
  await seedEvents();
  console.log(`Connected to MongoDB database: ${database.databaseName}`);
}

async function seedEvents() {
  const events = database.collection('events');
  if (await events.countDocuments() > 0) return;
  const now = new Date();
  const daysFromNow = (days, hour = 10) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date;
  };
  await events.insertMany([
    { title: 'Buildathon 2026', category: 'Technical', description: 'Team up, turn your ideas into prototypes, and build something useful in this student-focused hackathon. Bring your laptop, curiosity, and a willingness to learn.', venue: 'Innovation Lab', startAt: daysFromNow(4, 9), endAt: daysFromNow(4, 18), organizer: 'Coding Club', capacity: 120, image: 'code', createdAt: now },
    { title: 'Design Thinking Workshop', category: 'Workshop', description: 'Explore problem discovery, rapid ideation, and low-fidelity prototyping in a hands-on session designed for curious creators.', venue: 'Seminar Hall 2', startAt: daysFromNow(7, 11), endAt: daysFromNow(7, 13), organizer: 'Design Society', capacity: 60, image: 'design', createdAt: now },
    { title: 'Rhythm & Roots', category: 'Cultural', description: 'An evening of music, dance, and student performances celebrating the many talents and traditions on campus.', venue: 'Open Air Theatre', startAt: daysFromNow(10, 17), endAt: daysFromNow(10, 20), organizer: 'Cultural Committee', capacity: 250, image: 'music', createdAt: now },
    { title: 'Inter-Department Sports Meet', category: 'Sports', description: 'Bring your team spirit to a day of friendly competition, inclusive games, and cheering for your department.', venue: 'Main Sports Ground', startAt: daysFromNow(13, 8), endAt: daysFromNow(13, 16), organizer: 'Sports Council', capacity: 200, image: 'sports', createdAt: now },
    { title: 'Career Stories: Alumni Panel', category: 'Career', description: 'Hear alumni share practical lessons from internships, first jobs, and navigating the transition from campus to career.', venue: 'Auditorium', startAt: daysFromNow(16, 14), endAt: daysFromNow(16, 16), organizer: 'Career Development Cell', capacity: 150, image: 'career', createdAt: now },
    { title: 'Open Mic & Poetry Night', category: 'Cultural', description: 'Share a poem, a story, a song, or simply enjoy a relaxed night of student creativity and community.', venue: 'Student Commons', startAt: daysFromNow(20, 18), endAt: daysFromNow(20, 20), organizer: 'Literary Circle', capacity: 80, image: 'mic', createdAt: now }
  ]);
  console.log('Seeded sample campus events.');
}

export function getDatabase() {
  if (!database) throw new Error('Database is not connected');
  return database;
}

export async function closeDatabase() {
  if (client) await client.close();
}
