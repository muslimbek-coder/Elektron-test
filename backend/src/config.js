require('dotenv').config();

function parseOrigins(raw) {
  if (!raw) return ['http://localhost:5500'];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  dbPath: process.env.DB_PATH || './data/bilimdueli.db',
};
