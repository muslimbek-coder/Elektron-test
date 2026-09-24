const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config');
const { attachSocketHandlers } = require('./sockets');

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.corsOrigins, methods: ['GET', 'POST'] },
});

attachSocketHandlers(io);

server.listen(config.port, () => {
  console.log(`Elektron Test backend ${config.port}-portda ishga tushdi.`);
  console.log(`Ruxsat etilgan frontend manzillari: ${config.corsOrigins.join(', ')}`);
});
