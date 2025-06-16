# Realtime Collaborative Editor

A real-time collaborative text editor built with Vue.js 3 and Yjs, featuring both plain text and rich text editing capabilities with live user awareness and cursor tracking.

## Features

### ✨ Core Features
- **Real-time Collaboration**: Multiple users can edit the same document simultaneously
- **Dual Editor Modes**: Switch between plain text and rich text editing
- **User Awareness**: See other users' cursors, selections, and typing indicators
- **Document Sessions**: Create or join document sessions using unique IDs
- **Persistent Documents**: Documents persist across sessions using Yjs CRDT technology

### 🎯 Rich Text Features
- **EditorJS Integration**: Professional rich text editing with blocks
- **Structured Content**: Support for headers, paragraphs, lists, and more
- **Block-based Editing**: Modern content creation experience

### 👥 Collaboration Features
- **Live Cursors**: See where other users are editing in real-time
- **User Identification**: Each user gets a unique name and color
- **Typing Indicators**: Visual feedback when users are actively typing
- **Connection Status**: Enhanced server logging and user tracking

## Tech Stack

### Frontend (UI)
- **Vue.js 3** - Progressive JavaScript framework with Composition API
- **Vite** - Fast build tool and development server
- **Yjs** - Conflict-free Replicated Data Type (CRDT) for collaborative editing
- **y-websocket** - WebSocket provider for Yjs
- **EditorJS** - Block-styled rich text editor

### Backend (Server)
- **Node.js** - JavaScript runtime
- **WebSocket (ws)** - Real-time bidirectional communication
- **Yjs Server** - Document synchronization and persistence
- **Express** - Web application framework (if needed for additional routes)

## Project Structure

```
realtime-editor.js/
├── ui/                          # Vue.js frontend application
│   ├── src/
│   │   ├── components/
│   │   │   ├── DocumentSelector.vue    # Document selection interface
│   │   │   ├── PlainTextEditor.vue     # Plain text collaborative editor
│   │   │   └── RichTextEditor.vue      # Rich text collaborative editor
│   │   ├── utils/
│   │   │   └── userUtils.js            # User management utilities
│   │   ├── App.vue                     # Main application component
│   │   └── main.js                     # Application entry point
│   ├── package.json
│   └── vite.config.js
├── server/                      # Node.js backend server
│   ├── server.js               # WebSocket server with Yjs integration
│   └── package.json
└── package.json                # Root package configuration
```

## Getting Started

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** or **yarn**

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd realtime-editor.js
   ```

2. **Install root dependencies**
   ```bash
   npm install
   ```

3. **Install server dependencies**
   ```bash
   cd server
   npm install
   cd ..
   ```

4. **Install UI dependencies**
   ```bash
   cd ui
   npm install
   cd ..
   ```

### Running the Application

1. **Start the WebSocket Server**
   ```bash
   cd server
   node server.js
   ```
   
   The server will start on `ws://localhost:1234` and display enhanced logging with user activity tracking.

2. **Start the Vue.js Development Server**
   ```bash
   cd ui
   npm run dev
   ```
   
   The UI will be available at `http://localhost:5173` (or the port shown in your terminal).

3. **Open Multiple Browser Tabs**
   
   To test collaboration, open the application in multiple browser tabs or different browsers and join the same document session.

## Usage

### Creating/Joining a Document Session

1. **Enter a Document ID**: Use any alphanumeric string as your document identifier
2. **Select Editor Type**: Choose between "Plain Text" or "Rich Text" editing
3. **Start Editing**: Click "Start Editing" to join the collaborative session

### Collaboration

- **Multiple Users**: Share the same document ID with others to collaborate
- **Real-time Updates**: See changes appear instantly as others type
- **User Awareness**: Observe other users' cursors and selections
- **Persistent Sessions**: Documents remain available as long as the server is running

### Editor Features

#### Plain Text Editor
- Simple, fast text editing
- Real-time synchronization
- Cursor and selection tracking
- Suitable for code, notes, or simple documents

#### Rich Text Editor
- Block-based content creation
- Headers, paragraphs, and lists
- Professional editing experience
- Structured document creation

## Configuration

### Server Configuration
The WebSocket server runs on port `1234` by default. To change this:

1. Edit `server/server.js`
2. Modify the port in the WebSocketServer configuration:
   ```javascript
   const wss = new WebSocketServer({ port: YOUR_PORT })
   ```

### UI Configuration
The frontend is configured to connect to `ws://localhost:1234`. For production or different environments:

1. Update WebSocket connection URLs in the editor components
2. Modify the Vite configuration if needed for deployment

## Development

### Building for Production

1. **Build the UI**
   ```bash
   cd ui
   npm run build
   ```

2. **Preview Production Build**
   ```bash
   cd ui
   npm run preview
   ```

### Development Features

- **Hot Module Replacement**: Changes to Vue components update instantly
- **Enhanced Logging**: Server provides detailed activity logs
- **Error Handling**: Comprehensive error handling for WebSocket connections
- **User Tracking**: Detailed user session management and awareness

## Architecture

### Real-time Synchronization
The application uses **Yjs** (Y.js), a CRDT implementation that enables:
- **Conflict-free Merging**: Multiple users can edit simultaneously without conflicts
- **Offline Support**: Changes can be made offline and synchronized when reconnected
- **Undo/Redo**: Built-in operation history
- **Binary Efficiency**: Optimized data transmission

### User Awareness System
- **Client Identification**: Each connection gets a unique client ID
- **User Metadata**: Names, colors, and connection timestamps
- **Cursor Tracking**: Real-time cursor position and selection data
- **Activity Monitoring**: Typing indicators and user presence

### Document Management
- **Session Isolation**: Each document ID creates an isolated collaboration space
- **Memory Storage**: Documents persist in server memory during runtime
- **Connection Mapping**: Robust mapping between WebSocket connections and documents

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source. Please check the license file for more details.

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Ensure the WebSocket server is running on port 1234
   - Check for firewall or antivirus blocking the connection

2. **Changes Not Syncing**
   - Verify all clients are connected to the same document ID
   - Check browser console for WebSocket errors

3. **Performance Issues**
   - Large documents may experience slower synchronization
   - Consider breaking large documents into smaller sections

### Debug Mode
The server provides extensive logging. Monitor the server console for:
- Connection status
- Document activity
- User awareness updates
- Error messages

## Support

For issues, questions, or contributions, please create an issue in the repository or contact the development team.

---

**Happy Collaborative Editing!** 🎉
