const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const ShareDB = require('sharedb');
const WebSocketJSONStream = require('websocket-json-stream');
const path = require('path');
const url = require('url');

// Configure ShareDB with in-memory database
const backend = new ShareDB();

// Create new document
const connection = backend.connect();
const doc = connection.get('documents', 'example-doc');

doc.fetch(function(err) {
  if (err) throw err;
  if (doc.type === null) {
    doc.create({ 
      time: Date.now(),
      blocks: [],
      version: "2.28.2"
    }, function(err) {
      if (err) throw err;
      console.log('Created document');
    });
  }
});

// Set up Express
const app = express();
app.use(express.static('public'));
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create separate WebSocket servers for ShareDB and cursors
const shareDBServer = new WebSocket.Server({ 
    noServer: true,
    path: '/sharedb'
});

const cursorServer = new WebSocket.Server({ 
    noServer: true,
    path: '/cursors'
});

// Handle ShareDB connections
shareDBServer.on('connection', function(ws) {
    const stream = new WebSocketJSONStream(ws);
    backend.listen(stream);
});

// Store active cursor connections
const cursorConnections = new Map();

// Handle cursor update connections
cursorServer.on('connection', function(ws) {
    ws.on('message', function(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'cursor') {
                if (message.type === 'remove') {
                    cursorConnections.delete(message.clientId);
                } else {
                    cursorConnections.set(message.clientId, {
                        ws,
                        position: message.position,
                        clientInfo: message.clientInfo
                    });
                }
                
                // Broadcast to all other cursor connections
                cursorServer.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(data.toString());
                    }
                });
            }
        } catch (err) {
            console.error('Error processing cursor message:', err);
        }
    });
    
    ws.on('close', function() {
        // Find and remove the disconnected client's cursor
        cursorConnections.forEach((value, key) => {
            if (value.ws === ws) {
                cursorConnections.delete(key);
                // Broadcast removal to other clients
                cursorServer.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'cursor',
                            clientId: key,
                            type: 'remove'
                        }));
                    }
                });
            }
        });
    });
});

// Route WebSocket connections to appropriate server
server.on('upgrade', function(request, socket, head) {
    const pathname = url.parse(request.url).pathname;
    
    if (pathname === '/sharedb') {
        shareDBServer.handleUpgrade(request, socket, head, function(ws) {
            shareDBServer.emit('connection', ws, request);
        });
    } else if (pathname === '/cursors') {
        cursorServer.handleUpgrade(request, socket, head, function(ws) {
            cursorServer.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});