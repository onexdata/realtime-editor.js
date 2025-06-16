const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const url = require('url');

// Simple in-memory document storage
let documentData = {
    time: Date.now(),
    blocks: [],
    version: "2.28.2"
};

// Set up Express
const app = express();
app.use(express.static('public'));
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create separate WebSocket servers for document sync and cursors
const documentServer = new WebSocket.Server({ 
    noServer: true,
    path: '/document'
});

const cursorServer = new WebSocket.Server({ 
    noServer: true,
    path: '/cursors'
});

// Handle document synchronization connections
documentServer.on('connection', function(ws) {
    console.log('Document client connected');
    
    ws.on('message', function(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'get_document') {
                // Send current document data
                ws.send(JSON.stringify({
                    type: 'document_data',
                    data: documentData
                }));
                
            } else if (message.type === 'document_change') {
                // Update document and broadcast to all other clients
                documentData = message.data;
                console.log('Document updated by client:', message.clientId);
                
                // Broadcast to all other document clients
                documentServer.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'document_change',
                            data: documentData,
                            clientId: message.clientId
                        }));
                    }
                });
            }
        } catch (err) {
            console.error('Error processing document message:', err);
        }
    });
    
    ws.on('close', function() {
        console.log('Document client disconnected');
    });
});

// Store active cursor connections
const cursorConnections = new Map();

// Handle cursor update connections
cursorServer.on('connection', function(ws) {
    console.log('Cursor client connected');
    
    ws.on('message', function(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'cursor') {
                if (message.action === 'remove') {
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
        console.log('Cursor client disconnected');
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
                            action: 'remove'
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
    
    if (pathname === '/document') {
        documentServer.handleUpgrade(request, socket, head, function(ws) {
            documentServer.emit('connection', ws, request);
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
    console.log(`Open http://localhost:${PORT} to start collaborating!`);
});
